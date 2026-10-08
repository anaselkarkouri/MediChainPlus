"use strict";

/* ─── État global ─── */
const state = {
  token:   localStorage.getItem("mc_token")   || "",
  address: localStorage.getItem("mc_address") || "",
};

function $(id) {
  return document.getElementById(id);
}

function value(id) {
  const element = $(id);
  return element ? element.value.trim() : "";
}

function setText(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function setOutput(data, isError) {
  const output = $("output");
  output.classList.toggle("error", Boolean(isError));
  output.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function apiBase() {
  return value("apiBase").replace(/\/+$/, "");
}

function apiUrl(path) {
  return apiBase() + path;
}

function requireToken() {
  if (!state.token) {
    throw new Error("Connectez un wallet avant cette action.");
  }
  return state.token;
}

async function api(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token && !headers.authorization) {
    headers.authorization = "Bearer " + state.token;
  }
  const response = await fetch(apiUrl(path), { ...options, headers });
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : text || response.statusText;
    throw new Error(message);
  }

  return payload;
}

function authHeaders() {
  return { authorization: "Bearer " + requireToken() };
}

function jsonBody(data) {
  return JSON.stringify(data);
}

function jsonFromTextarea(id) {
  const raw = value(id);
  if (!raw) return {};
  return JSON.parse(raw);
}

function setWalletState() {
  if (state.address) {
    setText("walletState", state.address.slice(0, 6) + "..." + state.address.slice(-4));
  } else {
    setText("walletState", "Non connecte");
  }
}

async function run(handler) {
  try {
    const result = await handler();
    setOutput(result || { ok: true }, false);
    return result;
  } catch (error) {
    setOutput({ error: error.message }, true);
    toast(error.message, "error");
    return null;
  }
}

async function refreshStatus() {
  return run(async () => {
    const [health, contracts, fabric, ipfs, claims] = await Promise.all([
      api("/health"),
      api("/api/contracts"),
      api("/api/fabric/status"),
      api("/api/ipfs/status"),
      api("/api/reimbursement/claims/count"),
    ]);

    setText("backendStatus", health.status === "ok" ? "ok" : "erreur");
    setText("fabricStatus", fabric.mode || (health.fabricConfigured ? "configure" : "non configure"));
    setText("evmStatus", contracts.chainId ? "chain " + contracts.chainId : "-");
    setText("ipfsStatus", ipfs.connected ? "connecte" : "hors ligne");

    return {
      health,
      contracts,
      fabric,
      ipfs,
      reimbursement: claims,
    };
  });
}

async function connectWallet() {
  return run(async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask n'est pas disponible dans ce navigateur.");
    }

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const address = accounts[0];
    const challenge = await api("/api/auth/challenge", {
      method: "POST",
      body: jsonBody({ address }),
    });
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [challenge.message, address],
    });
    const verified = await api("/api/auth/verify", {
      method: "POST",
      body: jsonBody({ address, signature }),
    });

    state.token = verified.token;
    state.address = verified.address;
    localStorage.setItem("mc_token", state.token);
    localStorage.setItem("mc_address", state.address);
    setWalletState();

    return { address: verified.address, expiresInSeconds: verified.expiresInSeconds };
  });
}

function logout() {
  state.token = "";
  state.address = "";
  localStorage.removeItem("mc_token");
  localStorage.removeItem("mc_address");
  setWalletState();
  setOutput({ disconnected: true }, false);
}

function switchRole(role) {
  document.querySelectorAll(".role-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
  });
  document.querySelectorAll("[data-role-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.rolePanel === role);
  });
}

function bindActions() {
  const actions = {
    "get-patient": () => api("/api/fabric/patients/" + encodeURIComponent(value("patientId"))),
    "patient-consents": () => api("/api/fabric/patients/" + encodeURIComponent(value("patientId")) + "/consents"),
    "patient-records": () => api("/api/fabric/records/patient/" + encodeURIComponent(value("patientId"))),
    "patient-prescriptions": () => api("/api/fabric/prescriptions/patient/" + encodeURIComponent(value("patientId"))),
    "grant-consent": () => api("/api/fabric/patients/" + encodeURIComponent(value("patientId")) + "/consents", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody({
        granteeId: value("consentGrantee"),
        scope: value("consentScope"),
        expiresAt: value("consentExpires"),
      }),
    }),
    "revoke-consent": () => api(
      "/api/fabric/patients/" + encodeURIComponent(value("patientId")) +
      "/consents/" + encodeURIComponent(value("consentId")),
      { method: "DELETE", headers: authHeaders() }
    ),
    "claim-tx": () => api("/api/reimbursement/claims/tx", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody(claimPayload()),
    }),
    "submit-claim": () => api("/api/reimbursement/claims", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody(claimPayload()),
    }),
    "create-record": () => api("/api/fabric/records", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody(jsonFromTextarea("recordPayload")),
    }),
    "create-rx": () => api("/api/fabric/prescriptions", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody(jsonFromTextarea("rxPayload")),
    }),
    "records-by-patient": () => api("/api/fabric/records/patient/" + encodeURIComponent(value("doctorPatientId"))),
    "records-by-doctor": () => api("/api/fabric/records/doctor/" + encodeURIComponent(value("doctorId"))),
    "record-history": () => api("/api/fabric/records/" + encodeURIComponent(value("recordId")) + "/history"),
    "verify-record": () => api("/api/fabric/records/" + encodeURIComponent(value("recordId")) + "/verify-integrity", {
      method: "POST",
      body: jsonBody({ expectedFileHash: value("recordExpectedHash") }),
    }),
    "verify-drug": () => api("/api/drugs/" + encodeURIComponent(value("batchId"))),
    "drug-history": () => api("/api/drugs/" + encodeURIComponent(value("batchId")) + "/history"),
    "update-drug": () => api("/api/drugs/" + encodeURIComponent(value("batchId")) + "/status", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody({ status: value("drugStatusInput") }),
    }),
    "get-rx": () => api("/api/fabric/prescriptions/" + encodeURIComponent(value("pharmacyRxId"))),
    "verify-rx": () => api("/api/fabric/prescriptions/" + encodeURIComponent(value("pharmacyRxId")) + "/verify-signature", {
      method: "POST",
      body: jsonBody({ expectedSignatureHash: value("pharmacyExpectedSig") }),
    }),
    "dispense-rx": () => api("/api/fabric/prescriptions/" + encodeURIComponent(value("pharmacyRxId")) + "/dispense", {
      method: "PATCH",
      headers: authHeaders(),
      body: jsonBody({ pharmacyId: value("pharmacyId") }),
    }),
    "get-claim": () => api("/api/reimbursement/claims/" + encodeURIComponent(value("claimId"))),
    "validate-claim": () => api("/api/reimbursement/claims/" + encodeURIComponent(value("claimId")) + "/validate", {
      method: "POST",
      headers: authHeaders(),
    }),
    "pay-claim": () => api("/api/reimbursement/claims/" + encodeURIComponent(value("claimId")) + "/pay", {
      method: "POST",
      headers: authHeaders(),
    }),
    "reim-balance": () => api("/api/reimbursement/balance"),
    "claims-count": () => api("/api/reimbursement/claims/count"),
    "fund-contract": () => api("/api/reimbursement/fund", {
      method: "POST",
      headers: authHeaders(),
      body: jsonBody({ amountEth: value("fundEth") }),
    }),
    "claim-submitted-events": () => api("/api/reimbursement/events/submitted"),
    "claim-approved-events": () => api("/api/reimbursement/events/approved"),
    "payment-events": () => api("/api/reimbursement/events/payments"),
  };

  document.querySelectorAll("[data-run]").forEach((button) => {
    button.addEventListener("click", () => run(actions[button.dataset.run]));
  });
}

function claimPayload() {
  const payload = { amountEth: value("claimAmountEth") };
  if (value("patientId")) payload.patientId = value("patientId");
  if (value("claimRecordId")) payload.recordId = value("claimRecordId");
  if (value("claimExpectedHash")) payload.expectedFileHash = value("claimExpectedHash");
  return payload;
}

/* ─── Toasts ─── */
function toast(msg, kind) {
  const root = $("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.classList.add("fade"), 3000);
  setTimeout(() => el.remove(), 3300);
}

/* ─── Dark mode ─── */
function initTheme() {
  var btn = $("themeBtn");
  if (!btn) return;
  btn.addEventListener("click", function () {
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("mc_theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("mc_theme", "dark");
    }
  });
}

/* ─── Init ─── */
function init() {
  initTheme();

  document.querySelectorAll(".role-tab").forEach((button) => {
    button.addEventListener("click", () => switchRole(button.dataset.role));
  });

  $("refreshStatusBtn").addEventListener("click", async () => {
    const result = await refreshStatus();
    if (result) toast("Statut mis à jour", "success");
  });
  $("connectWalletBtn").addEventListener("click", async () => {
    const result = await connectWallet();
    if (result) toast("Wallet connecté : " + result.address.slice(0, 8) + "…", "success");
  });
  $("logoutBtn").addEventListener("click", () => {
    logout();
    toast("Déconnecté", "");
  });
  $("clearOutputBtn").addEventListener("click", () => setOutput({}, false));

  bindActions();
  const role = new URLSearchParams(location.search).get("role");
  if (["patient", "doctor", "pharmacy", "insurer"].includes(role)) {
    switchRole(role);
  }
  setWalletState();
  refreshStatus();
}

document.addEventListener("DOMContentLoaded", init);
