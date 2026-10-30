const prompt = require("prompt-sync")();
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Autenticacao = require("./autentication/autenticacao");

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/front-end.js": ["front-end.js", "text/javascript; charset=utf-8"],
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let bytesRead = 0;
  for await (const chunk of request) {
    bytesRead += chunk.length;
    if (bytesRead > 1024 * 1024) {
      const error = new Error("A requisição é muito grande.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error();
    }
    return data;
  } catch {
    const error = new Error("Envie os dados em formato JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getSessionId(request) {
  const cookies = request.headers.cookie || "";
  const sessionCookie = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("sessionId="));
  return sessionCookie ? sessionCookie.slice("sessionId=".length) : "";
}

function setSessionCookie(response, request, sessionId, maxAge) {
  const secure = request.socket.encrypted ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `sessionId=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`,
  );
}

async function handleApi(request, response, auth, sessions, pathname) {
  if (pathname === "/api/session" && request.method === "GET") {
    const sessionId = getSessionId(request);
    const session = sessions.get(sessionId);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      setSessionCookie(response, request, "", 0);
      sendJson(response, 401, { message: "Você não está conectado." });
      return;
    }
    sendJson(response, 200, { email: session.email });
    return;
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    sessions.delete(getSessionId(request));
    setSessionCookie(response, request, "", 0);
    sendJson(response, 200, { message: "Você saiu da sua conta." });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { message: "Método não permitido." });
    return;
  }

  const data = await readJsonBody(request);

  if (pathname === "/api/register" || pathname === "/api/users") {
    if (!isValidEmail(data.email) || typeof data.password !== "string" || data.password.length < 8) {
      sendJson(response, 400, { message: "Informe um e-mail válido e uma senha com pelo menos 8 caracteres." });
      return;
    }
    const user = auth.registrarUsuario(data.email, data.password);
    if (!user) {
      sendJson(response, 409, { message: "Este e-mail já está cadastrado." });
      return;
    }
    sendJson(response, 201, { message: "Cadastro realizado com sucesso." });
    return;
  }

  if (pathname === "/api/login") {
    if (!isValidEmail(data.email) || typeof data.password !== "string" || !data.password) {
      sendJson(response, 400, { message: "Informe um e-mail válido e sua senha." });
      return;
    }
    if (!(await auth.verificaSenhaEmail(data.password, data.email))) {
      sendJson(response, 401, { message: "E-mail ou senha incorretos." });
      return;
    }
    const sessionId = crypto.randomBytes(32).toString("hex");
    const email = data.email.trim().toLowerCase();
    sessions.set(sessionId, { email, expiresAt: Date.now() + SESSION_LIFETIME_MS });
    for (const [id, session] of sessions) {
      if (session.expiresAt <= Date.now()) {
        sessions.delete(id);
      }
    }
    setSessionCookie(response, request, sessionId, SESSION_LIFETIME_MS / 1000);
    sendJson(response, 200, { message: "Login realizado com sucesso.", email });
    return;
  }

  if (pathname === "/api/recovery/request") {
    if (!isValidEmail(data.email)) {
      sendJson(response, 400, { message: "Digite um endereço de e-mail válido." });
      return;
    }
    try {
      const sent = await auth.solicitarRecuperacaoSenha(data.email);
      if (!sent) {
        sendJson(response, 404, { message: "Este e-mail não está cadastrado." });
        return;
      }
    } catch (error) {
      if (error.message.startsWith("Aguarde")) {
        sendJson(response, 429, { message: error.message });
        return;
      }
      throw error;
    }
    sendJson(response, 200, { message: "Código enviado. Confira seu e-mail." });
    return;
  }

  if (pathname === "/api/recovery/reset") {
    if (!isValidEmail(data.email) || typeof data.code !== "string" ||
        !/^\d{6}$/.test(data.code) || typeof data.password !== "string" ||
        data.password.length < 8) {
      sendJson(response, 400, { message: "Confira o e-mail, o código de 6 dígitos e a senha com pelo menos 8 caracteres." });
      return;
    }
    const reset = await auth.redefinirSenha(data.email, data.code, data.password);
    if (!reset) {
      sendJson(response, 400, { message: "Código inválido ou expirado. Solicite um novo código." });
      return;
    }
    const email = data.email.trim().toLowerCase();
    const currentSessionId = getSessionId(request);
    const currentSession = sessions.get(currentSessionId);
    for (const [id, session] of sessions) {
      if (session.email === email) {
        sessions.delete(id);
      }
    }
    if (currentSession && currentSession.email === email) {
      setSessionCookie(response, request, "", 0);
    }
    sendJson(response, 200, { message: "Senha redefinida. Você já pode entrar." });
    return;
  }

  sendJson(response, 404, { message: "Rota não encontrada." });
}

function createServer(auth = new Autenticacao()) {
  const sessions = new Map();
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, auth, sessions, url.pathname);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
        response.end("Método não permitido.");
        return;
      }

      const file = staticFiles[url.pathname];
      if (!file) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Página não encontrada.");
        return;
      }

      const content = await fs.promises.readFile(path.join(__dirname, file[0]));
      response.writeHead(200, { "Content-Type": file[1] });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      const statusCode = error.statusCode || 500;
      if (statusCode === 500) {
        console.error("Erro ao processar requisição:", error);
      }
      sendJson(response, statusCode, {
        message: statusCode === 500 ? "Não foi possível concluir a operação." : error.message,
      });
    }
  });
}

async function main() {
  // if (!process.stdin.isTTY) {
  //   console.error("Execute `npm start` em um terminal interativo.");
  //   process.exitCode = 1;
  //   return;
  // }

  const autenticacao = new Autenticacao();
  let executando = true;

  while (executando) {
    console.log("\n=== Autenticação ===");
    console.log("1 - Entrar");
    console.log("2 - Cadastrar");
    console.log("3 - Esqueci minha senha");
    console.log("0 - Sair");

    const opcao = prompt("Escolha uma opção: ").trim();

    try {
      if (opcao === "1") {
        const email = prompt("Digite seu e-mail: ").trim();
        const senha = prompt("Digite sua senha: ", { echo: "*" });
        const autenticado = await autenticacao.verificaSenhaEmail(senha, email);
        console.log(autenticado ? "Login realizado com sucesso." : "E-mail ou senha incorretos.");

        break;

      } else if (opcao === "2") {
        const email = prompt("Digite seu e-mail: ").trim();
        const senha = prompt("Digite sua senha: ", { echo: "*" });
        const confirmarSenha = prompt("Confirme sua senha: ", { echo: "*" });

        if (senha !== confirmarSenha) {
          console.log("As senhas não são iguais.");
          continue;
        }

        const usuario = autenticacao.registrarUsuario(email, senha);
        console.log(usuario ? "Usuário cadastrado com sucesso." : "Não foi possível cadastrar o usuário.");
        
      } else if (opcao === "3") {
        const email = prompt("Digite o e-mail cadastrado: ").trim();
        const enviado = await autenticacao.solicitarRecuperacaoSenha(email);
        if (!enviado) {
          console.log(
            "Este e-mail não está cadastrado. Cadastre o e-mail que deseja usar antes de recuperar a senha.",
          );
          continue;
        }
        console.log("Um código de recuperação foi enviado para o seu e-mail.");

        const codigo = prompt("Digite o código recebido: ").trim();
        const novaSenha = prompt("Digite a nova senha (mínimo de 8 caracteres): ", { echo: "*" });
        const confirmarSenha = prompt("Confirme a nova senha: ", { echo: "*" });

        if (novaSenha !== confirmarSenha) {
          console.log("As senhas não são iguais. Solicite um novo código para tentar novamente.");
          continue;
        }

        const redefinida = await autenticacao.redefinirSenha(email, codigo, novaSenha);
        console.log(
          redefinida
            ? "Senha redefinida. Você já pode entrar."
            : "Código inválido ou expirado. Solicite um novo código.",
        );
      } else if (opcao === "0") {
        console.log("Obrigado por usar minha operação!")
        break;
      } else {
        console.log("Opção inválida.");
      }
    } catch (error) {
      console.error("Não foi possível concluir a operação:", error.message);
    }
  }
}

if (require.main === module && process.argv.includes("--cli")) {
  main().catch((error) => {
    console.error("Erro ao iniciar a autenticação:", error);
    process.exitCode = 1;
  });
} else if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT precisa ser uma porta válida.");
    process.exitCode = 1;
  } else {
    createServer().listen(port, () => {
      console.log(`Aplicação disponível em http://localhost:${port}`);
    });
  }
}

module.exports = { createServer, main };
