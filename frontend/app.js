// FinPay front end (plain JavaScript). All money is handled as INTEGER PAISE - never floating-point rupees.
const API = "/api";
let token = localStorage.getItem("fp_token");
let user = JSON.parse(localStorage.getItem("fp_user") || "null");
let meta = null;      // merchants, cashback rules, tiers
let wallet = null;    // { tier, balance_paise } or null if no wallet yet
let view = "dashboard";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ----- money helpers -----
function fmt(paise) { // 12345 -> "₹123.45"
  const neg = paise < 0; const p = Math.abs(paise);
  return (neg ? "-" : "") + "₹" + Math.floor(p / 100).toLocaleString("en-IN") + "." + String(p % 100).padStart(2, "0");
}
function rupeesToPaise(text) { // "123.4" -> 12340 ; returns null when not a valid amount (max 2 decimals)
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0") || 0);
}
const CATEGORY_LABEL = { CANTEEN: "Canteen", STATIONERY: "Stationery", TRANSPORT: "Transport", HOSTEL: "Hostel", ONLINE: "Online", TOPUP: "Top-up" };
const catLabel = (c) => CATEGORY_LABEL[c] || c;
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3600);
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  } catch {
    const e = new Error("Cannot reach the server. Check your connection and try again."); e.network = true; throw e;
  }
  let data = {}; try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && token && !path.startsWith("/auth")) { logout(); throw new Error("Session expired. Please sign in again."); }
  if (!res.ok) { const e = new Error(data.message || "Request failed."); e.status = res.status; e.code = data.code; throw e; }
  return data;
}

function logout() {
  token = null; user = null; wallet = null;
  localStorage.removeItem("fp_token"); localStorage.removeItem("fp_user");
  renderAuth("login");
}

// ----- sign in / register -----
function renderAuth(mode) {
  $("app").classList.add("hidden"); $("auth").classList.remove("hidden");
  const reg = mode === "register";
  $("auth").innerHTML = `<div class="auth-card">
    <div class="brand"><span class="logo">₹</span><span>fin<b>pay</b></span></div>
    <h2>${reg ? "Create your account" : "Welcome back"}</h2><p class="muted">${reg ? "Join the campus wallet." : "Sign in to your wallet."}</p>
    <form id="auth-form" style="margin-top:20px">
      ${reg ? `<div class="field"><label>FULL NAME</label><input name="name" required maxlength="100"></div>` : ""}
      <div class="field"><label>EMAIL</label><input name="email" type="email" required></div>
      <div class="field"><label>PASSWORD</label><input name="password" type="password" required minlength="${reg ? 8 : 1}"><div class="hint">${reg ? "At least 8 characters." : ""}</div></div>
      <button class="btn" style="width:100%" id="auth-btn">${reg ? "Create account" : "Sign in"}</button>
    </form>
    <p class="muted" style="text-align:center;margin-top:18px">${reg ? "Already registered?" : "New to FinPay?"} <button class="link" id="switch">${reg ? "Sign in" : "Create an account"}</button></p></div>`;
  $("switch").onclick = () => renderAuth(reg ? "login" : "register");
  $("auth-form").onsubmit = async (e) => {
    e.preventDefault(); const btn = $("auth-btn"); btn.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await api(reg ? "/auth/register" : "/auth/login", { method: "POST", body: JSON.stringify(body) });
      token = r.token; user = r.user;
      localStorage.setItem("fp_token", token); localStorage.setItem("fp_user", JSON.stringify(user));
      await start();
    } catch (err) { toast(err.message); btn.disabled = false; }
  };
}

// ----- app shell -----
const NAV = [["dashboard", "◫", "Dashboard"], ["pay", "➚", "Pay"], ["topup", "＋", "Add money"], ["history", "☰", "History"], ["settings", "⚙", "Settings"]];
const TITLES = { dashboard: "Dashboard", pay: "Make a payment", topup: "Add money", history: "Transaction history", settings: "Settings" };

function renderShell() {
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  $("who").innerHTML = `<span>${esc(user.name)}</span><div class="avatar">${esc(initials(user.name))}</div>`;
  $("nav").innerHTML = NAV.map(([id, ico, label]) => `<button class="nav-item ${id === view ? "active" : ""}" data-view="${id}"><span>${ico}</span> ${label}</button>`).join("");
  $("nav").querySelectorAll(".nav-item").forEach((b) => (b.onclick = () => go(b.dataset.view)));
  $("signout").onclick = logout;
}

async function go(v) {
  view = v; renderShell(); $("title").textContent = wallet ? TITLES[v] : "Open your wallet";
  const c = $("content"); c.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    await loadWallet();
    if (!wallet) { $("title").textContent = "Open your wallet"; return onboarding(); }
    await ({ dashboard, pay: () => paymentForm("pay"), topup: () => paymentForm("topup"), history, settings })[v]();
  } catch (err) { c.innerHTML = `<div class="card"><div class="result bad">${esc(err.message)}</div></div>`; }
}

async function loadWallet() { wallet = (await api("/wallet")).wallet; }

// ----- onboarding: open a wallet (STUDENT 1 : 0..1 WALLET) -----
function tierOptions(selected) {
  return meta.tiers.map((t) => `<option value="${esc(t.tier)}" ${t.tier === selected ? "selected" : ""}>${esc(t.tier)} - ${t.rate_mult_x10 / 10}x cashback rate, ${t.cap_mult_x10 / 10}x monthly caps</option>`).join("");
}
function onboarding() {
  $("content").innerHTML = `<div class="card narrow"><h3>You don't have a wallet yet</h3>
    <p class="muted">Open one to add money, pay campus merchants and earn cashback.</p>
    <form id="open-form"><div class="field"><label>WALLET TIER</label><select name="tier">${tierOptions("BASIC")}</select>
    <div class="hint">Demo setting: in a real campus rollout the tier would be assigned by the administrator.</div></div>
    <button class="btn">Open wallet</button></form></div>`;
  $("open-form").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/wallet", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); toast("Wallet opened."); go("dashboard"); }
    catch (err) { toast(err.message); }
  };
}

// ----- dashboard -----
async function dashboard() {
  const [sum, hist] = await Promise.all([api("/wallet/cashback-summary"), api("/transactions?limit=5")]);
  const cats = sum.categories.filter((c) => c.cap_paise > 0);
  $("content").innerHTML = `<div class="grid">
    <div class="card balance"><div class="label">WALLET BALANCE</div><div class="amount">${fmt(wallet.balance_paise)}</div><span class="pill">${esc(wallet.tier)} tier</span></div>
    <div class="card"><h3>Cashback this month</h3>${cats.map((c) => {
      const pct = Math.min(100, Math.round((c.earned_paise / c.cap_paise) * 100));
      return `<div class="cat"><div class="row"><span>${catLabel(c.category)}</span><span>${fmt(c.earned_paise)} / ${fmt(c.cap_paise)}</span></div>
        <div class="bar"><i class="${pct >= 100 ? "full" : ""}" style="width:${pct}%"></i></div>
        <div class="hint">${c.remaining_paise === 0 ? "Monthly cap reached" : fmt(c.remaining_paise) + " cashback still available"}</div></div>`;
    }).join("")}</div></div>
    <div class="card"><h3>Recent activity</h3>${txTable(hist.transactions)}</div>`;
}

const isTopup = (t) => t.category === "TOPUP";
function txTable(rows) {
  if (!rows.length) return `<div class="empty">No transactions yet.</div>`;
  return `<table><thead><tr><th>DATE</th><th>MERCHANT</th><th>CATEGORY</th><th class="num">AMOUNT</th><th class="num">CASHBACK</th></tr></thead><tbody>${rows.map((t) =>
    `<tr><td>${esc(new Date(t.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}</td><td>${esc(t.merchant_name)}</td>
     <td><span class="tag">${esc(catLabel(t.category))}</span></td>
     <td class="num ${isTopup(t) ? "in" : "out"}">${isTopup(t) ? "+" : "−"}${fmt(t.amount_paise)}</td>
     <td class="num ${t.cashback_paise ? "in" : ""}">${t.cashback_paise ? "+" + fmt(t.cashback_paise) : "—"}</td></tr>`).join("")}</tbody></table>`;
}

// ----- pay / add money -----
function paymentForm(kind) {
  const topup = kind === "topup";
  const merchants = meta.merchants.filter((m) => (m.category === "TOPUP") === topup);
  const groups = {}; merchants.forEach((m) => (groups[m.category] = groups[m.category] || []).push(m));
  const options = Object.entries(groups).map(([cat, list]) => `<optgroup label="${esc(catLabel(cat))}">${list.map((m) => `<option value="${m.merchant_id}">${esc(m.merchant_name)}</option>`).join("")}</optgroup>`).join("");
  $("content").innerHTML = `<div class="card narrow"><h3>${topup ? "Add money to your wallet" : "Pay a campus merchant"}</h3>
    <form id="pay-form">
      <div class="field" ${topup ? 'style="display:none"' : ""}><label>MERCHANT</label><select name="merchant" id="merchant">${options}</select><div class="hint" id="rate-hint"></div></div>
      <div class="field"><label>AMOUNT (₹)</label><input name="amount" id="amount" inputmode="decimal" placeholder="e.g. 100 or 249.50" autocomplete="off" required>
      <div class="hint">Balance: ${fmt(wallet.balance_paise)}${topup ? "" : " · whole rupees or up to 2 decimals"}</div></div>
      <button class="btn" id="pay-btn">${topup ? "Add money" : "Pay now"}</button>
    </form><div id="result"></div></div>`;

  let key = null; // ONE key per payment attempt. Re-sent on retry so a repeated click can never charge twice.
  const resetKey = () => { key = null; };
  $("amount").oninput = resetKey; $("merchant").onchange = () => { resetKey(); hint(); };

  const hint = () => {
    const m = meta.merchants.find((x) => x.merchant_id === Number($("merchant").value));
    const rule = m && meta.rules.find((r) => r.category === m.category);
    const tier = meta.tiers.find((t) => t.tier === wallet.tier);
    if (!rule || !tier || rule.base_rate_bps === 0) { $("rate-hint").textContent = ""; return; }
    const pct = (rule.base_rate_bps * tier.rate_mult_x10) / 1000;
    const cap = Math.floor((rule.base_monthly_cap_paise * tier.cap_mult_x10) / 10);
    $("rate-hint").textContent = `${wallet.tier}: ${pct}% cashback, up to ${fmt(cap)} per month in ${catLabel(m.category)}.`;
  };
  if (!topup) hint();

  $("pay-form").onsubmit = async (e) => {
    e.preventDefault();
    const out = $("result"); const btn = $("pay-btn");
    const paise = rupeesToPaise($("amount").value);
    if (!paise || paise <= 0) { out.innerHTML = `<div class="result bad">Enter a valid amount greater than 0 (up to 2 decimal places).</div>`; return; }
    const merchantId = topup ? merchants[0].merchant_id : Number($("merchant").value);
    key = key || newKey();
    btn.disabled = true; out.innerHTML = "";
    try {
      const r = await api("/payments", { method: "POST", body: JSON.stringify({ merchant_id: merchantId, amount_paise: paise, idempotency_key: key }) });
      wallet.balance_paise = r.balance_paise;
      out.innerHTML = r.duplicate
        ? `<div class="result dup"><b>Already processed.</b><br>This payment went through earlier, so you were not charged again.<br>${fmt(r.amount_paise)} · ${esc(r.merchant_name)}</div>`
        : `<div class="result ok"><b>${topup ? "Money added" : "Payment successful"} ✓</b><br>${topup ? "Added" : "Paid"} ${fmt(r.amount_paise)} ${topup ? "" : "to " + esc(r.merchant_name)}
           ${topup ? "" : `<br>Cashback earned: <b>${fmt(r.cashback_paise)}</b>${r.cashback_capped ? " (limited by your monthly cap)" : ""}`}<br>New balance: <b>${fmt(r.balance_paise)}</b></div>`;
      $("amount").value = ""; resetKey();
    } catch (err) {
      // Network problems / server errors keep the key so a retry is safe; clear business rejections get a fresh key.
      if (!(err.network || err.status >= 500)) resetKey();
      out.innerHTML = `<div class="result bad">${esc(err.message)}</div>`;
    } finally { btn.disabled = false; }
  };
}

// ----- history -----
async function history() {
  const PAGE = 20; let offset = 0;
  $("content").innerHTML = `<div class="card"><div id="tx"></div><div style="margin-top:14px;text-align:center"><button class="btn ghost hidden" id="more">Load more</button></div></div>`;
  let all = [];
  const load = async () => {
    const { transactions } = await api(`/transactions?limit=${PAGE}&offset=${offset}`);
    all = all.concat(transactions); offset += transactions.length;
    $("tx").innerHTML = txTable(all);
    $("more").classList.toggle("hidden", transactions.length < PAGE);
  };
  $("more").onclick = () => load().catch((e) => toast(e.message));
  await load();
}

// ----- settings -----
function settings() {
  $("content").innerHTML = `<div class="card narrow"><h3>Wallet tier</h3>
    <p class="muted">Your tier sets the cashback rate and monthly caps.</p>
    <form id="tier-form"><div class="field"><label>TIER</label><select name="tier">${tierOptions(wallet.tier)}</select>
    <div class="hint">Demo setting: in a real campus rollout the tier would be assigned by the administrator.</div></div><button class="btn">Save tier</button></form></div>`;
  $("tier-form").onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api("/wallet/tier", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); wallet = r.wallet; toast("Tier updated to " + wallet.tier + "."); }
    catch (err) { toast(err.message); }
  };
}

// ----- start -----
async function start() {
  try { meta = await api("/meta"); } catch (err) { toast(err.message); }
  if (token && user) { if (!meta) return renderAuth("login"); view = "dashboard"; await go("dashboard"); } else renderAuth("login");
}
start();
