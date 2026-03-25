const noticeContentEl = document.getElementById("noticeContent");
const noticeMsgEl = document.getElementById("noticeMsg");
const debugVersionEl = document.getElementById("debugVersion");

function inferBasePath() {
  const pathname = window.location.pathname || "";
  if (pathname.endsWith("/notice")) {
    return pathname.slice(0, -"/notice".length);
  }
  if (pathname.endsWith("/visitor")) {
    return pathname.slice(0, -"/visitor".length);
  }
  if (pathname.endsWith("/admin")) {
    return pathname.slice(0, -"/admin".length);
  }
  return "";
}

const BASE_PATH = window.__BASE_PATH__ || inferBasePath();

function setMsg(text, ok = false) {
  noticeMsgEl.className = ok ? "ok" : "error";
  noticeMsgEl.textContent = text;
}

async function requestJson(url, options, fallbackMessage) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!contentType.includes("application/json")) {
    const preview = raw.replace(/\s+/g, " ").slice(0, 80);
    throw new Error(`接口返回非 JSON（${res.status} ${res.statusText}）: ${url} ${preview}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_err) {
    throw new Error(`接口 JSON 解析失败: ${url}`);
  }

  if (!res.ok || !data.success) {
    throw new Error(data.message || fallbackMessage);
  }

  return data;
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

async function loadNotice() {
  try {
    const data = await requestJson(`${BASE_PATH}/api/public/notice`, undefined, "加载须知失败");
    noticeContentEl.textContent = data.content || "暂无须知内容。";
  } catch (e) {
    setMsg(e.message || "加载须知失败");
  }
}

loadVersion();
loadNotice();
