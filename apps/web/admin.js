const tabs = {
  fields: {
    button: document.getElementById("tabFields"),
    panel: document.getElementById("panelFields")
  },
  list: {
    button: document.getElementById("tabList"),
    panel: document.getElementById("panelList")
  },
  calendar: {
    button: document.getElementById("tabCalendar"),
    panel: document.getElementById("panelCalendar")
  },
  notice: {
    button: document.getElementById("tabNotice"),
    panel: document.getElementById("panelNotice")
  }
};

const msgEl = document.getElementById("adminMsg");
const fieldRows = document.getElementById("fieldRows");
const appRows = document.getElementById("appRows");
const calendarEl = document.getElementById("calendar");
const debugVersionEl = document.getElementById("debugVersion");

function inferBasePath() {
  const pathname = window.location.pathname || "";
  if (pathname.endsWith("/admin")) {
    return pathname.slice(0, -"/admin".length);
  }
  if (pathname.endsWith("/visitor")) {
    return pathname.slice(0, -"/visitor".length);
  }
  return "";
}

const BASE_PATH = window.__BASE_PATH__ || inferBasePath();

const fType = document.getElementById("fType");
const optWrap = document.getElementById("optWrap");
const fieldFormTitle = document.getElementById("fieldFormTitle");
const fKey = document.getElementById("fKey");
const fLabel = document.getElementById("fLabel");
const fRequired = document.getElementById("fRequired");
const fOptionInput = document.getElementById("fOptionInput");
const addOptionBtn = document.getElementById("addOptionBtn");
const optionList = document.getElementById("optionList");
const saveFieldBtn = document.getElementById("saveFieldBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const calMonth = document.getElementById("calMonth");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const qKeyword = document.getElementById("qKeyword");
const qStatus = document.getElementById("qStatus");
const qFromDate = document.getElementById("qFromDate");
const qToDate = document.getElementById("qToDate");
const pageInfo = document.getElementById("pageInfo");
const calendarDetailsBody = document.getElementById("calendarDetailsBody");
const openFromDateBtn = document.getElementById("openFromDateBtn");
const openToDateBtn = document.getElementById("openToDateBtn");
const noticeContentInput = document.getElementById("noticeContentInput");
const saveNoticeBtn = document.getElementById("saveNoticeBtn");

const REJECT_REASON_LABELS = {
  date_conflict: "日期冲突",
  letter_invalid: "公函不合格",
  info_incomplete: "资料不完整",
  other: "其他"
};

let fieldsCache = [];
let optionDraft = [];
let editingFieldId = null;
let listState = {
  page: 1,
  pageSize: 10,
  totalPages: 1
};

function setMsg(text, ok = false) {
  msgEl.className = ok ? "ok" : "error";
  msgEl.textContent = text;
}

async function loadVersion() {
  if (!debugVersionEl) {
    return;
  }
  try {
    const res = await fetch(`${BASE_PATH}/api/public/version`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error("加载版本失败");
    }
    debugVersionEl.textContent = `版本: v${data.version} | 路径: ${data.basePath}`;
  } catch (_e) {
    debugVersionEl.textContent = "版本: 获取失败";
  }
}

function switchTab(name) {
  Object.entries(tabs).forEach(([k, v]) => {
    const active = k === name;
    v.button.classList.toggle("active", active);
    v.panel.classList.toggle("hidden", !active);
  });
}

Object.entries(tabs).forEach(([name, tab]) => {
  tab.button.addEventListener("click", () => switchTab(name));
});

fType.addEventListener("change", () => {
  optWrap.classList.toggle("hidden", fType.value !== "select");
  if (fType.value !== "select") {
    optionDraft = [];
    renderOptionDraft();
  }
});

function renderOptionDraft() {
  optionList.innerHTML = "";
  optionDraft.forEach((opt, idx) => {
    const chip = document.createElement("span");
    chip.className = "option-chip";
    chip.innerHTML = `<span>${opt}</span><button type="button" data-opt-del="${idx}">移除</button>`;
    optionList.appendChild(chip);
  });

  optionList.querySelectorAll("button[data-opt-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.optDel);
      optionDraft.splice(idx, 1);
      renderOptionDraft();
    });
  });
}

function resetFieldForm() {
  editingFieldId = null;
  fieldFormTitle.textContent = "新增字段";
  saveFieldBtn.textContent = "保存字段";
  cancelEditBtn.classList.add("hidden");
  fKey.disabled = false;
  fType.disabled = false;
  fRequired.disabled = false;

  fKey.value = "";
  fLabel.value = "";
  fType.value = "text";
  fRequired.value = "true";
  fOptionInput.value = "";
  optionDraft = [];
  optWrap.classList.add("hidden");
  renderOptionDraft();
}

function startEditField(field) {
  editingFieldId = field.id;
  fieldFormTitle.textContent = `编辑字段 #${field.id}`;
  saveFieldBtn.textContent = "更新字段";
  cancelEditBtn.classList.remove("hidden");

  fKey.value = field.key;
  fLabel.value = field.label;
  fType.value = field.type;
  fRequired.value = field.required ? "true" : "false";
  optionDraft = [...(field.options || [])];
  fOptionInput.value = "";
  optWrap.classList.toggle("hidden", field.type !== "select");
  renderOptionDraft();

  const isFixedVisitTime = field.key === "visit_time";
  fKey.disabled = isFixedVisitTime;
  fType.disabled = isFixedVisitTime;
  fRequired.disabled = isFixedVisitTime;
}

addOptionBtn.addEventListener("click", () => {
  const text = fOptionInput.value.trim();
  if (!text) {
    return;
  }
  if (optionDraft.includes(text)) {
    setMsg("该选项已存在");
    return;
  }
  optionDraft.push(text);
  fOptionInput.value = "";
  renderOptionDraft();
});

cancelEditBtn.addEventListener("click", resetFieldForm);

function openDatePicker(input) {
  if (typeof input.showPicker === "function") {
    input.showPicker();
    return;
  }
  input.focus();
}

openFromDateBtn.addEventListener("click", () => openDatePicker(qFromDate));
openToDateBtn.addEventListener("click", () => openDatePicker(qToDate));

function setQuickRange(days) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  qFromDate.value = fmt(start);
  qToDate.value = fmt(end);
  listState.page = 1;
  loadApplications(1).catch((e) => setMsg(e.message || "快捷筛选失败"));
}

document.getElementById("range3dBtn").addEventListener("click", () => setQuickRange(3));
document.getElementById("range7dBtn").addEventListener("click", () => setQuickRange(7));
document.getElementById("range30dBtn").addEventListener("click", () => setQuickRange(30));

async function loadFields() {
  const res = await fetch(`${BASE_PATH}/api/admin/fields`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "加载字段失败");
  }
  fieldsCache = data.fields;
  fieldRows.innerHTML = "";
  data.fields.forEach((f, idx) => {
    const isFixedVisitTime = f.key === "visit_time";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.key}</td>
      <td>${f.label}${isFixedVisitTime ? " <span class=\"tag\">固定</span>" : ""}</td>
      <td>${f.type}</td>
      <td>${f.required ? "是" : "否"}</td>
      <td>
        <span class="order-controls">
          <button class="secondary" data-up="${f.id}" ${idx === 0 ? "disabled" : ""}>上移</button>
          <button class="secondary" data-down="${f.id}" ${idx === data.fields.length - 1 ? "disabled" : ""}>下移</button>
        </span>
        <button class="secondary" data-edit="${f.id}">编辑</button>
        <button class="danger" data-del="${f.id}" ${isFixedVisitTime ? "disabled" : ""}>删除</button>
      </td>
    `;
    fieldRows.appendChild(tr);
  });

  fieldRows.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.del;
      if (!confirm("确定删除该字段？")) {
        return;
      }
      const r = await fetch(`${BASE_PATH}/api/admin/fields/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!d.success) {
        return setMsg(d.message || "删除失败");
      }
      setMsg("删除成功", true);
      loadFields();
    });
  });

  fieldRows.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.edit);
      const current = data.fields.find((f) => f.id === id);
      if (!current) {
        return;
      }
      startEditField(current);
    });
  });

  fieldRows.querySelectorAll("button[data-up]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.up);
      await moveField(id, -1);
    });
  });

  fieldRows.querySelectorAll("button[data-down]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.down);
      await moveField(id, 1);
    });
  });
}

async function moveField(id, step) {
  const idx = fieldsCache.findIndex((f) => f.id === id);
  const targetIdx = idx + step;
  if (idx < 0 || targetIdx < 0 || targetIdx >= fieldsCache.length) {
    return;
  }

  const cloned = [...fieldsCache];
  const [item] = cloned.splice(idx, 1);
  cloned.splice(targetIdx, 0, item);
  const orderedIds = cloned.map((f) => f.id);

  const res = await fetch(`${BASE_PATH}/api/admin/fields/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds })
  });
  const data = await res.json();
  if (!data.success) {
    setMsg(data.message || "排序失败");
    return;
  }
  setMsg("排序已更新", true);
  await loadFields();
}

async function addField() {
  const key = fKey.value.trim();
  const label = fLabel.value.trim();
  const type = fType.value;
  const required = fRequired.value === "true";
  const options = [...optionDraft];

  if (type === "select" && options.length === 0) {
    setMsg("选择类型至少需要一个选项");
    return;
  }

  const payload = { key, label, type, required, options };
  const isEditing = Boolean(editingFieldId);
  const url = isEditing ? `${BASE_PATH}/api/admin/fields/${editingFieldId}` : `${BASE_PATH}/api/admin/fields`;
  const method = isEditing ? "PUT" : "POST";
  if (isEditing) {
    payload.sortOrder = editingFieldId;
  }

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.success) {
    return setMsg(data.message || (isEditing ? "更新失败" : "新增失败"));
  }
  setMsg(isEditing ? "更新字段成功" : "新增字段成功", true);
  resetFieldForm();
  await loadFields();
}

saveFieldBtn.addEventListener("click", () => {
  addField().catch((e) => setMsg(e.message || "新增失败"));
});

async function loadApplications(page = listState.page) {
  const fromDate = qFromDate.value.trim();
  const toDate = qToDate.value.trim();
  const keyword = qKeyword.value.trim();
  const status = qStatus.value.trim();

  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("开始日期不能晚于结束日期");
  }

  const params = new URLSearchParams({ page: String(page), pageSize: String(listState.pageSize) });
  if (fromDate) {
    params.set("fromDate", fromDate);
  }
  if (toDate) {
    params.set("toDate", toDate);
  }
  if (status) {
    params.set("status", status);
  }
  if (keyword) {
    params.set("q", keyword);
  }

  const res = await fetch(`${BASE_PATH}/api/admin/applications?${params.toString()}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "加载申请失败");
  }
  listState.page = data.page;
  listState.totalPages = data.totalPages || 1;
  pageInfo.textContent = `第 ${listState.page} / ${listState.totalPages} 页（共 ${data.total} 条）`;
  appRows.innerHTML = "";
  data.items.forEach((item) => {
    const tr = document.createElement("tr");
    const statusText = item.status === "approved" ? "已通过" : item.status === "rejected" ? "已驳回" : "待审批";
    const statusNote = item.status === "rejected" ? `（${item.rejectReasonText || "无理由"}）` : "";
    const visitTime = item.data["来访时间"] || item.data["访客访问时间"] || "-";
    const content = Object.entries(item.data)
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          const links = v
            .filter((x) => x && typeof x === "object" && x.url)
            .map((x) => {
              const link = x.url.startsWith("/uploads/") ? `${BASE_PATH}${x.url}` : x.url;
              return `<a href="${link}" target="_blank">${x.name}</a>`;
            });
          if (links.length > 0) {
            return `${k}: ${links.join("、")}`;
          }
        }
        if (v && typeof v === "object" && v.url) {
          const link = v.url.startsWith("/uploads/") ? `${BASE_PATH}${v.url}` : v.url;
          return `${k}: <a href="${link}" target="_blank">${v.name}</a>`;
        }
        return `${k}: ${v}`;
      })
      .join("<br />");

    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.createdAt}</td>
      <td>${visitTime}</td>
      <td>${item.companyName || "-"}</td>
      <td>${statusText}${statusNote}</td>
      <td>
        <div class="approval-controls">
          <button class="secondary" data-approve="${item.id}" ${item.status === "approved" ? "disabled" : ""}>通过</button>
          <select data-reason-code="${item.id}">
            <option value="">驳回预设理由</option>
            <option value="date_conflict">日期冲突</option>
            <option value="letter_invalid">公函不合格</option>
            <option value="info_incomplete">资料不完整</option>
            <option value="other">其他</option>
          </select>
          <input data-reason-text="${item.id}" placeholder="或输入驳回理由" />
          <button class="danger" data-reject="${item.id}" ${item.status === "rejected" ? "disabled" : ""}>驳回</button>
        </div>
      </td>
      <td>${content || "-"}</td>
    `;
    appRows.appendChild(tr);
  });

  appRows.querySelectorAll("button[data-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.approve);
      await decideApplication(id, { decision: "approved" });
    });
  });

  appRows.querySelectorAll("button[data-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.reject);
      const reasonCode = document.querySelector(`[data-reason-code="${id}"]`).value.trim();
      const reasonText = document.querySelector(`[data-reason-text="${id}"]`).value.trim();
      if (!reasonCode && !reasonText) {
        setMsg("驳回时必须填写理由或选择预设理由");
        return;
      }
      await decideApplication(id, { decision: "rejected", reasonCode, reasonText });
    });
  });
}

async function decideApplication(id, payload) {
  const res = await fetch(`${BASE_PATH}/api/admin/applications/${id}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.success) {
    setMsg(data.message || "审批失败");
    return;
  }
  const resultText = payload.decision === "approved" ? "已通过" : "已驳回";
  const detail = payload.reasonText || REJECT_REASON_LABELS[payload.reasonCode] || "";
  setMsg(detail ? `审批成功：${resultText}（${detail}）` : `审批成功：${resultText}`, true);
  await loadApplications(listState.page);
  await loadCalendar();
}

document.getElementById("searchListBtn").addEventListener("click", () => {
  listState.page = 1;
  loadApplications(1).catch((e) => setMsg(e.message || "查询失败"));
});

document.getElementById("prevPageBtn").addEventListener("click", () => {
  if (listState.page <= 1) {
    return;
  }
  loadApplications(listState.page - 1).catch((e) => setMsg(e.message || "翻页失败"));
});

document.getElementById("nextPageBtn").addEventListener("click", () => {
  if (listState.page >= listState.totalPages) {
    return;
  }
  loadApplications(listState.page + 1).catch((e) => setMsg(e.message || "翻页失败"));
});

function renderCalendar(month, byDay) {
  calendarEl.innerHTML = "";
  calendarDetailsBody.textContent = "点击有高亮的日期查看单位名称。";
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const totalDays = new Date(y, m, 0).getDate();
  const weekdayOffset = first.getDay();

  for (let i = 0; i < weekdayOffset; i += 1) {
    const blank = document.createElement("div");
    calendarEl.appendChild(blank);
  }

  for (let d = 1; d <= totalDays; d += 1) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const dayInfo = byDay[date] || { totalCount: 0, approvedCount: 0, pendingCount: 0, companies: [] };
    const cell = document.createElement("div");
    const isApproved = dayInfo.approvedCount > 0;
    const isPending = dayInfo.pendingCount > 0;
    cell.className = `day${isApproved ? " approved" : ""}${isPending ? " pending" : ""}`;
    const companyPreview = dayInfo.companies.length > 0 ? dayInfo.companies.slice(0, 2).join("、") : "";
    cell.innerHTML = `
      <div class="n">${d}</div>
      <div class="badge">总申请 ${dayInfo.totalCount}</div>
      <div class="badge">已预约 ${dayInfo.approvedCount}</div>
      <div class="badge">待审批 ${dayInfo.pendingCount}</div>
      <div class="companies">${companyPreview || ""}</div>
    `;
    cell.addEventListener("click", async () => {
      if (dayInfo.approvedCount > 0 || dayInfo.pendingCount > 0) {
        calendarDetailsBody.innerHTML = `
          <div><strong>${date}</strong> 已预约 ${dayInfo.approvedCount} 条，待审批 ${dayInfo.pendingCount} 条</div>
          <div style="margin-top:6px">单位：${dayInfo.companies.join("、") || "-"}</div>
        `;
      } else {
        calendarDetailsBody.innerHTML = `<div><strong>${date}</strong> 暂无已预约记录</div>`;
      }
      qFromDate.value = date;
      qToDate.value = date;
      switchTab("list");
      await loadApplications();
    });
    calendarEl.appendChild(cell);
  }
}

async function loadCalendar() {
  const month = calMonth.value.trim();
  const res = await fetch(`${BASE_PATH}/api/admin/calendar?month=${encodeURIComponent(month)}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "加载日历失败");
  }
  renderCalendar(data.month, data.byDay || {});
}

async function loadNotice() {
  const res = await fetch(`${BASE_PATH}/api/admin/notice`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "加载须知失败");
  }
  noticeContentInput.value = data.content || "";
}

async function saveNotice() {
  const content = noticeContentInput.value || "";
  const res = await fetch(`${BASE_PATH}/api/admin/notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "保存须知失败");
  }
  setMsg("须知已保存", true);
}

saveNoticeBtn.addEventListener("click", () => {
  saveNotice().catch((e) => setMsg(e.message || "保存失败"));
});

document.getElementById("loadCalBtn").addEventListener("click", () => {
  loadCalendar().catch((e) => setMsg(e.message || "加载失败"));
});

function initMonth() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  calMonth.value = `${now.getFullYear()}-${m}`;
}

function shiftMonth(offset) {
  const raw = calMonth.value.trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  const base = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
  base.setMonth(base.getMonth() + offset);
  const m = String(base.getMonth() + 1).padStart(2, "0");
  calMonth.value = `${base.getFullYear()}-${m}`;
}

prevMonthBtn.addEventListener("click", () => {
  shiftMonth(-1);
  loadCalendar().catch((e) => setMsg(e.message || "加载失败"));
});

nextMonthBtn.addEventListener("click", () => {
  shiftMonth(1);
  loadCalendar().catch((e) => setMsg(e.message || "加载失败"));
});

async function init() {
  loadVersion();
  switchTab("list");
  resetFieldForm();
  initMonth();
  await loadNotice();
  await loadFields();
  await loadApplications(1);
  await loadCalendar();
}

init().catch((e) => setMsg(e.message || "初始化失败"));
