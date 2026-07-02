const PASSWORD_HASH = "replace-with-sha256-hash";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function byId(id) {
  return document.getElementById(id);
}

async function unlock() {
  byId("lock-error").hidden = true;
  byId("unlock-button").disabled = true;
  byId("unlock-button").textContent = "正在进入...";
  const password = byId("password-input").value;
  const hash = await sha256(password);
  if (PASSWORD_HASH !== "replace-with-sha256-hash" && hash !== PASSWORD_HASH) {
    byId("lock-error").hidden = false;
    byId("unlock-button").disabled = false;
    byId("unlock-button").textContent = "进入";
    return;
  }
  const loaded = await loadDashboard(password);
  if (!loaded) {
    byId("lock-error").textContent = "密码不正确，或报告数据暂时无法解密。";
    byId("lock-error").hidden = false;
    byId("dashboard").hidden = true;
    byId("unlock-button").disabled = false;
    byId("unlock-button").textContent = "进入";
    return;
  }
  byId("lock-screen").hidden = true;
  byId("unlock-button").disabled = false;
  byId("unlock-button").textContent = "进入";
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

async function loadDashboard(password) {
  const encrypted = await fetchJson("./encrypted-data.json").catch(() => null);
  const bundle = encrypted ? await decryptBundle(encrypted, password).catch(() => null) : await loadDevelopmentBundle();
  const latest = bundle?.latest || null;
  const history = bundle?.history || [];
  if (!latest) {
    return false;
  }
  byId("dashboard").hidden = false;
  renderLatest(latest);
  renderHistory(history.slice(0, 30));
  byId("search-input").addEventListener("input", (event) => {
    const keyword = event.target.value.trim();
    const filtered = history.filter((item) => JSON.stringify(item).includes(keyword)).slice(0, 30);
    renderHistory(filtered);
  });
  return true;
}

async function loadDevelopmentBundle() {
  const latest = await fetchJson("../outputs/site-data/latest.json").catch(() => null);
  const history = await fetchJson("../outputs/site-data/history.json").catch(() => []);
  return { latest, history };
}

async function decryptBundle(encrypted, password) {
  const salt = base64ToBytes(encrypted.salt);
  const nonce = base64ToBytes(encrypted.nonce);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: encrypted.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function renderLatest(report) {
  byId("primary-action").textContent = report.primaryAction;
  byId("recommendation").textContent = report.recommendation;
  byId("logic-steps").innerHTML = report.logicSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  byId("source-row").innerHTML = report.sources.map((source) => `<span class="chip">${escapeHtml(source.name)} · ${escapeHtml(source.status)}</span>`).join("");
  byId("holdings").innerHTML = report.holdings.map(renderHolding).join("");
  byId("candidate").innerHTML = report.candidate ? renderCandidate(report.candidate) : "<p class='muted'>今日无候选。</p>";
}

function renderHolding(holding) {
  const pnlClass = holding.unrealizedPnl >= 0 ? "positive" : "negative";
  return `
    <div class="holding-row">
      <strong>${escapeHtml(holding.name)} ${escapeHtml(holding.symbol)}</strong>
      <p class="muted">成本 ${holding.costPrice} · 现价 ${holding.currentPrice} · ${holding.shares} 股</p>
      <p class="${pnlClass}">浮动盈亏 ${holding.unrealizedPnl.toFixed(2)} 元</p>
    </div>
  `;
}

function renderCandidate(candidate) {
  return `
    <div class="holding-row">
      <strong>${escapeHtml(candidate.name)} ${escapeHtml(candidate.symbol)}</strong>
      <p class="muted">${escapeHtml(candidate.decision)} · 预期空间 ${(candidate.expectedUpsidePct * 100).toFixed(1)}%</p>
    </div>
  `;
}

function renderHistory(history) {
  byId("history-list").innerHTML = history.map((item) => `
    <article class="history-item">
      <strong>${escapeHtml(item.title)} · ${escapeHtml(item.primaryAction)}</strong>
      <p class="muted">${escapeHtml(item.generatedAt)} · ${escapeHtml(item.recommendation)}</p>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

byId("unlock-button").addEventListener("click", unlock);
byId("password-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlock();
});
