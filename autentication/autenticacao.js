const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const SenhaUtil = require("./senhaUtil");
const {
  findUserByEmail,
  saveUser,
  updateUserPassword,
} = require("../Database/database");

const RECOVERY_CODE_LIFETIME_MS = 15 * 60 * 1000;
const RECOVERY_COOLDOWN_MS = 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;

function createMailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Configure SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no arquivo .env.");
  }

  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP_PORT precisa ser uma porta válida.");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }
  return email.trim().toLowerCase();
}

class Autenticacao {
  constructor({
    findUser = findUserByEmail,
    saveUser: persistUser = saveUser,
    changePassword = updateUserPassword,
    mailTransporter,
    clock = Date.now,
    randomCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, "0"),
  } = {}) {
    this.findUser = findUser;
    this.persistUser = persistUser;
    this.changePassword = changePassword;
    this.mailTransporter = mailTransporter;
    this.clock = clock;
    this.randomCode = randomCode;
    this.recoveryCodes = new Map();
    this.recoveryCooldowns = new Map();
  }

  registrarUsuario(email, senha) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || typeof senha !== "string" || senha.length < 8) {
      throw new Error("Informe um e-mail válido e uma senha com pelo menos 8 caracteres.");
    }
    if (this.findUser(normalizedEmail)) {
      return null;
    }

    const salt = SenhaUtil.gerarSalt();
    const hash = SenhaUtil.gerarHash(senha, salt);
    return this.persistUser({ email: normalizedEmail, hash, salt });
  }

  async verificaSenhaEmail(senha, email) {
    const user = this.findUser(normalizeEmail(email));
    if (!user || typeof senha !== "string") {
      return false;
    }

    const hash = SenhaUtil.gerarHash(senha, user.salt);
    const expectedHash = Buffer.from(user.hash, "hex");
    const actualHash = Buffer.from(hash, "hex");
    return (
      expectedHash.length === actualHash.length &&
      crypto.timingSafeEqual(expectedHash, actualHash)
    );
  }

  async solicitarRecuperacaoSenha(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Digite um endereço de e-mail válido.");
    }

    const now = this.clock();
    const cooldownUntil = this.recoveryCooldowns.get(normalizedEmail) || 0;
    if (now < cooldownUntil) {
      throw new Error("Aguarde um minuto antes de solicitar outro código.");
    }
    this.recoveryCooldowns.set(normalizedEmail, now + RECOVERY_COOLDOWN_MS);

    const user = this.findUser(normalizedEmail);
    if (!user) {
      return false;
    }

    const code = this.randomCode();
    this.recoveryCodes.set(normalizedEmail, {
      code,
      expiresAt: now + RECOVERY_CODE_LIFETIME_MS,
      attempts: 0,
    });

    try {
      const transporter = this.mailTransporter || createMailTransporter();
      this.mailTransporter = transporter;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: normalizedEmail,
        subject: "Código para redefinir sua senha",
        text: `Seu código para redefinir a senha é ${code}. Ele expira em 15 minutos. Se você não pediu a redefinição, ignore este e-mail.`,
        html: `<p>Olá ${normalizedEmail}</p><p>Seu código para redefinir a senha é:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>Ele expira em 15 minutos. Se você não pediu a redefinição, ignore este e-mail.</p>`,
      });
    } catch (error) {
      this.recoveryCodes.delete(normalizedEmail);
      this.recoveryCooldowns.delete(normalizedEmail);
      throw new Error("Não foi possível enviar o e-mail de recuperação.", { cause: error });
    }

    return true;
  }

  async redefinirSenha(email, code, novaSenha) {
    const normalizedEmail = normalizeEmail(email);
    if (typeof novaSenha !== "string" || novaSenha.length < 8) {
      throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
    }

    const recovery = this.recoveryCodes.get(normalizedEmail);
    if (!recovery || recovery.expiresAt <= this.clock()) {
      this.recoveryCodes.delete(normalizedEmail);
      return false;
    }
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      recovery.attempts += 1;
      if (recovery.attempts >= MAX_RECOVERY_ATTEMPTS) {
        this.recoveryCodes.delete(normalizedEmail);
      }
      return false;
    }

    const expectedCode = Buffer.from(recovery.code);
    const receivedCode = Buffer.from(code);
    const matches =
      expectedCode.length === receivedCode.length &&
      crypto.timingSafeEqual(expectedCode, receivedCode);
    if (!matches) {
      recovery.attempts += 1;
      if (recovery.attempts >= MAX_RECOVERY_ATTEMPTS) {
        this.recoveryCodes.delete(normalizedEmail);
      }
      return false;
    }

    const user = this.findUser(normalizedEmail);
    if (!user) {
      this.recoveryCodes.delete(normalizedEmail);
      return false;
    }

    const salt = SenhaUtil.gerarSalt();
    const hash = SenhaUtil.gerarHash(novaSenha, salt);
    const updated = this.changePassword(normalizedEmail, { hash, salt });
    if (!updated) {
      throw new Error("Não foi possível salvar a nova senha.");
    }

    this.recoveryCodes.delete(normalizedEmail);
    this.recoveryCooldowns.delete(normalizedEmail);
    return true;
  }
}

module.exports = Autenticacao;
