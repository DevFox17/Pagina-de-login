const assert = require("node:assert/strict");
const test = require("node:test");
const Autenticacao = require("../autentication/autenticacao");

function createTestAuth(options = {}) {
  let currentUser = Object.hasOwn(options, "user")
    ? options.user
    : { email: "person@example.com", hash: "old", salt: "old-salt" };
  let currentTime = options.now || 0;
  let sentMessage;
  const auth = new Autenticacao({
    findUser: (email) => (currentUser?.email === email ? currentUser : undefined),
    saveUser: (nextUser) => nextUser,
    changePassword: (email, password) => {
      if (!currentUser || currentUser.email !== email) {
        return false;
      }
      currentUser = { ...currentUser, ...password };
      return true;
    },
    mailTransporter: {
      sendMail: async (message) => {
        sentMessage = message;
      },
    },
    clock: () => currentTime,
    randomCode: () => "482913",
  });

  return {
    auth,
    getCurrentUser: () => currentUser,
    getSentMessage: () => sentMessage,
    setCurrentTime: (time) => {
      currentTime = time;
    },
  };
}

test("sends a temporary recovery code to the registered email", async () => {
  const { auth, getSentMessage } = createTestAuth();

  assert.equal(await auth.solicitarRecuperacaoSenha(" Person@Example.com "), true);
  assert.equal(getSentMessage().to, "person@example.com");
  assert.match(getSentMessage().text, /482913/);
  assert.match(getSentMessage().html, /482913/);
});

test("does not send mail when the address is not registered", async () => {
  const { auth, getSentMessage } = createTestAuth({ user: undefined });

  assert.equal(await auth.solicitarRecuperacaoSenha("person@example.com"), false);
  assert.equal(getSentMessage(), undefined);
});

test("changes the password only after a valid code is entered", async () => {
  const { auth, getCurrentUser } = createTestAuth();

  await auth.solicitarRecuperacaoSenha("person@example.com");
  assert.equal(await auth.redefinirSenha("person@example.com", "000000", "new-password"), false);
  assert.equal(getCurrentUser().hash, "old");

  assert.equal(await auth.redefinirSenha("person@example.com", "482913", "new-password"), true);
  assert.notEqual(getCurrentUser().hash, "old");
  assert.equal(await auth.verificaSenhaEmail("new-password", "person@example.com"), true);
});

test("expires recovery codes after fifteen minutes", async () => {
  const { auth, setCurrentTime } = createTestAuth();

  await auth.solicitarRecuperacaoSenha("person@example.com");
  setCurrentTime(15 * 60 * 1000);

  assert.equal(await auth.redefinirSenha("person@example.com", "482913", "new-password"), false);
});

test("limits incorrect recovery-code attempts", async () => {
  const { auth } = createTestAuth();

  await auth.solicitarRecuperacaoSenha("person@example.com");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(await auth.redefinirSenha("person@example.com", "000000", "new-password"), false);
  }

  assert.equal(await auth.redefinirSenha("person@example.com", "482913", "new-password"), false);
});

test("requires a valid email and a password with at least eight characters", async () => {
  const { auth } = createTestAuth();

  await assert.rejects(auth.solicitarRecuperacaoSenha("invalid"), /e-mail válido/);
  await assert.rejects(
    auth.redefinirSenha("person@example.com", "482913", "short"),
    /pelo menos 8 caracteres/,
  );
});
