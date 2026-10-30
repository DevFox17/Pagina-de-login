const views = {
  login: document.getElementById("loginView"),
  register: document.getElementById("registerView"),
  recoveryRequest: document.getElementById("recoveryRequestView"),
  recoveryReset: document.getElementById("recoveryResetView"),
  authenticated: document.getElementById("authenticatedView"),
};
const statusMessage = document.getElementById("statusMessage");
const authenticatedEmail = document.getElementById("authenticatedEmail");
let recoveryEmail = "";

function showView(name) {
  if (!views[name]) {
    throw new Error(`Tela desconhecida: ${name}`);
  }
  Object.entries(views).forEach(([viewName, view]) => {
    view.hidden = viewName !== name;
  });
  statusMessage.textContent = "";
  delete statusMessage.dataset.type;
}

async function submitRequest(url, values, method = "POST") {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: values ? { "Content-Type": "application/json" } : {},
      body: values ? JSON.stringify(values) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Tente novamente.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("O servidor retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Não foi possível concluir a operação.");
  }
  return result;
}

function showError(error) {
  statusMessage.textContent = error.message || "Não foi possível concluir a operação.";
  statusMessage.dataset.type = "error";
}

function showSuccess(message) {
  statusMessage.textContent = message;
  statusMessage.dataset.type = "success";
}

function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

function handleForm(id, action) {
  const form = document.getElementById(id);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton.disabled) {
      return;
    }

    submitButton.disabled = true;
    try {
      await action(form);
    } catch (error) {
      showError(error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.querySelectorAll("[data-view]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showView(link.dataset.view);
  });
});

handleForm("loginForm", async (form) => {
  const result = await submitRequest("/api/login", formValues(form));
  authenticatedEmail.textContent = result.email;
  form.reset();
  showView("authenticated");
  showSuccess(result.message);
});

handleForm("registerForm", async (form) => {
  const values = formValues(form);
  if (values.password !== values.confirmPassword) {
    throw new Error("As senhas não são iguais.");
  }

  const result = await submitRequest("/api/register", {
    email: values.email,
    password: values.password,
  });
  form.reset();
  showView("login");
  showSuccess(result.message);
});

handleForm("recoveryRequestForm", async (form) => {
  recoveryEmail = formValues(form).email.trim();
  const result = await submitRequest("/api/recovery/request", { email: recoveryEmail });
  document.getElementById("recoveryResetEmail").value = recoveryEmail;
  form.reset();
  showView("recoveryReset");
  showSuccess(result.message);
});

handleForm("recoveryResetForm", async (form) => {
  const values = formValues(form);
  if (values.password !== values.confirmPassword) {
    throw new Error("As senhas não são iguais.");
  }

  const result = await submitRequest("/api/recovery/reset", {
    email: recoveryEmail,
    code: values.code.trim(),
    password: values.password,
  });
  form.reset();
  recoveryEmail = "";
  showView("login");
  showSuccess(result.message);
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    const result = await submitRequest("/api/logout");
    authenticatedEmail.textContent = "";
    showView("login");
    showSuccess(result.message);
  } catch (error) {
    showError(error);
  }
});

async function restoreSession() {
  try {
    const session = await submitRequest("/api/session", undefined, "GET");
    authenticatedEmail.textContent = session.email;
    showView("authenticated");
  } catch (error) {
    if (error.message !== "Você não está conectado.") {
      showError(error);
    }
  }
}

restoreSession();
