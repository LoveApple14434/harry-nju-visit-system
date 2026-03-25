const phoneInputEl = document.getElementById("phoneInput");
const queryBtnEl = document.getElementById("queryBtn");
const queryMsgEl = document.getElementById("queryMsg");
const querySummaryEl = document.getElementById("querySummary");
const resultRowsEl = document.getElementById("resultRows");
const debugVersionEl = document.getElementById("debugVersion");

function inferBasePath() {
  const pathname = window.location.pathname || "";
  if (pathname.endsWith("/visitor")) {
    return pathname.slice(0, -"/visitor".length);
  }
  if (pathname.endsWith("/admin")) {
    return pathname.slice(0, -"/admin".length);
  }
  if (pathname.endsWith("/notice")) {
    return pathname.slice(0, -"/notice".length);
  }
  if (pathname.endsWith("/query")) {
    return pathname.slice(0, -"/query".length);
  }
  return "";
}

const BASE_PATH = window.__BASE_PATH__ || inferBasePath();

const STATUS_LABELS = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回"
};

function statusClass(status) {
  if (status === "approved") {
    return "status-approved";
  }
  if (status === "rejected") {
    return "status-rejected";
  }
  return "status-pending";
}

function setMsg(text, ok = false) {
  queryMsgEl.className = ok ? "ok" : "error";
  queryMsgEl.textContent = text;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

async function requestJson(url, options, fallbackMessage) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessage || "接口返回格式异常");
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_err) {
    throw new Error("接口 JSON 解析失败");
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || fallbackMessage || "请求失败");
  }

  return data;
}

function renderRows(items) {
  resultRowsEl.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    resultRowsEl.innerHTML = '<tr><td colspan="8" class="hint">未查询到对应预约记录</td></tr>';
    return;
  }

  items.forEach((item) => {
    const tr = document.createElement("tr");
    const statusText = STATUS_LABELS[item.status] || item.status || "-";
    const note = item.status === "rejected" ? item.rejectReasonText || "已驳回" : "-";

    tr.innerHTML = `
      <td>#${item.id}</td>
      <td>${item.visitorName || "-"}</td>
      <td>${item.visitTime || "-"}</td>
      <td>${item.companyName || "-"}</td>
      <td><span class="status-pill ${statusClass(item.status)}">${statusText}</span></td>
      <td>${formatTime(item.createdAt)}</td>
      <td>${formatTime(item.decisionAt)}</td>
      <td>${note}</td>
    `;

    resultRowsEl.appendChild(tr);
  });
}

async function doQuery() {
  const phone = (phoneInputEl.value || "").trim();
  if (!phone) {
    setMsg("请先输入手机号码");
    return;
  }

  queryBtnEl.disabled = true;
  setMsg("正在查询...");

  try {
    const url = `${BASE_PATH}/api/public/applications/query?phone=${encodeURIComponent(phone)}`;
    const data = await requestJson(url, undefined, "查询失败");
    renderRows(data.items || []);
    querySummaryEl.textContent = `手机号 ${data.phone} 共查询到 ${data.total} 条记录（最多展示 50 条）`;
    setMsg("查询成功", true);
  } catch (e) {
    renderRows([]);
    querySummaryEl.textContent = "请输入手机号后查询。";
    setMsg(e.message || "查询失败");
  } finally {
    queryBtnEl.disabled = false;
  }
}

async function loadVersion() {
  if (!debugVersionEl) {
    return;
  }
  try {
    const data = await requestJson(`${BASE_PATH}/api/public/version`, undefined, "加载版本失败");
    debugVersionEl.textContent = `版本: v${data.version} | 路径: ${data.basePath}`;
  } catch (_e) {
    debugVersionEl.textContent = "版本: 获取失败";
  }
}

queryBtnEl.addEventListener("click", doQuery);
phoneInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    doQuery();
  }
});

loadVersion();
