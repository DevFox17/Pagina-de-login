const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createServer } = require("../index");

test("serves the authentication page and connects its API actions", async (t) => {
  const users = new Set();
  const auth = {
    registrarUsuario(email) {
      if (users.has(email)) {
        return null;
      }
      users.add(email);
      return { email };
    },
    async verificaSenhaEmail(password, email) {
      return password === "password123" && users.has(email);
    },
    async solicitarRecuperacaoSenha(email) {
      return users.has(email);
    },
    async redefinirSenha(email, code, password) {
      return users.has(email) && code === "123456" && password.length >= 8;
    },
  };
  const server = createServer(auth);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /id="loginForm"/);
  assert.match(html, /id="authenticatedView"/);

  const invalidJson = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert.equal(invalidJson.status, 400);

  const wrongMethod = await fetch(`${baseUrl}/api/login`);
  assert.equal(wrongMethod.status, 405);

  const register = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", password: "password123" }),
  });
  assert.equal(register.status, 201);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", password: "password123" }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];

  const session = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { email: "person@example.com" });

  const invalidLogin = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", password: "wrong-password" }),
  });
  assert.equal(invalidLogin.status, 401);
  assert.equal(invalidLogin.headers.get("set-cookie"), null);

  const logout = await fetch(`${baseUrl}/api/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);

  const endedSession = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(endedSession.status, 401);

  const recovery = await fetch(`${baseUrl}/api/recovery/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com" }),
  });
  assert.equal(recovery.status, 200);

  const secondLogin = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", password: "password123" }),
  });
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.get("set-cookie").split(";")[0];

  const reset = await fetch(`${baseUrl}/api/recovery/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: secondCookie },
    body: JSON.stringify({
      email: "person@example.com",
      code: "123456",
      password: "newpass123",
    }),
  });
  assert.equal(reset.status, 200);
  assert.match(reset.headers.get("set-cookie"), /Max-Age=0/);

  const resetSession = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: secondCookie },
  });
  assert.equal(resetSession.status, 401);
});
