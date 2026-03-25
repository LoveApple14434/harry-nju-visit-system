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
  }
};

const msgEl = document.getElementById("adminMsg");
const fieldRows = document.getElementById("fieldRows");
const appRows = document.getElementById("appRows");
const calendarEl = document.getElementById("calendar");

const fType = document.getElementById("fType");
const optWrap = document.getElementById("optWrap");
const calMonth = document.getElementById("calMonth");
const qKeyword = document.getElementById("qKeyword");
const qStatus = document.getElementById("qStatus");
const pageInfo = document.getElementById("pageInfo");
const calendarDetailsBody = document.getElementById("calendarDetailsBody");

const REJECT_REASON_LABELS = {
  date_conflict: "日期冲突",
  letter_invalid: "公函不合格",
  info_incomplete: "资料不完整",
  other: "其他"
};

let fieldsCache = [];
let listState = {
  page: 1,
  pageSize: 10,
  totalPages: 1
};

function setMsg(text, ok = false) {
  msgEl.className = ok ? "ok" : "error";
  msgEl.textContent = text;
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
});

async function loadFields() {
  const res = await fetch("/api/admin/fields");
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
      <td>${f.id}</td>
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
      const r = await fetch(`/api/admin/fields/${id}`, { method: "DELETE" });
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
      const label = prompt("字段名称", current.label) || current.label;
      const required = confirm("点击确定表示必填，取消表示非必填");
      const type = prompt("类型(text/number/select/file)", current.type) || current.type;
      let options = current.options || [];
      if (type === "select") {
        const raw = prompt("选择项(逗号分隔)", options.join(",")) || "";
        options = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const r = await fetch(`/api/admin/fields/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: current.key,
          label,
          type,
          required,
          options,
          sortOrder: id
        })
      });
      const d = await r.json();
      if (!d.success) {
        return setMsg(d.message || "更新失败");
      }
      setMsg("更新成功", true);
      loadFields();
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

  const res = await fetch("/api/admin/fields/reorder", {
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
  const key = document.getElementById("fKey").value.trim();
  const label = document.getElementById("fLabel").value.trim();
  const type = document.getElementById("fType").value;
  const required = document.getElementById("fRequired").value === "true";
  const optionsRaw = document.getElementById("fOptions").value;
  const options = optionsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const res = await fetch("/api/admin/fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, label, type, required, options })
  });
  const data = await res.json();
  if (!data.success) {
    return setMsg(data.message || "新增失败");
  }
  setMsg("新增字段成功", true);
  ["fKey", "fLabel", "fOptions"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  loadFields();
}

document.getElementById("addFieldBtn").addEventListener("click", () => {
  addField().catch((e) => setMsg(e.message || "新增失败"));
});

async function loadApplications(page = listState.page) {
  const from = document.getElementById("qFrom").value.trim();
  const to = document.getElementById("qTo").value.trim();
  const keyword = qKeyword.value.trim();
  const status = qStatus.value.trim();
  const params = new URLSearchParams({ page: String(page), pageSize: String(listState.pageSize) });
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }
  if (status) {
    params.set("status", status);
  }
  if (keyword) {
    params.set("q", keyword);
  }

  const res = await fetch(`/api/admin/applications?${params.toString()}`);
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
    const content = Object.entries(item.data)
      .map(([k, v]) => {
        if (v && typeof v === "object" && v.url) {
          return `${k}: <a href="${v.url}" target="_blank">${v.name}</a>`;
        }
        return `${k}: ${v}`;
      })
      .join("<br />");

    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.createdAt}</td>
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
  const res = await fetch(`/api/admin/applications/${id}/decision`, {
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
    const dayInfo = byDay[date] || { totalCount: 0, approvedCount: 0, companies: [] };
    const cell = document.createElement("div");
    cell.className = `day${dayInfo.approvedCount > 0 ? " approved" : ""}`;
    const companyPreview = dayInfo.companies.length > 0 ? dayInfo.companies.slice(0, 2).join("、") : "";
    cell.innerHTML = `
      <div class="n">${d}</div>
      <div class="badge">总申请 ${dayInfo.totalCount}</div>
      <div class="badge">已预约 ${dayInfo.approvedCount}</div>
      <div class="companies">${companyPreview || ""}</div>
    `;
    cell.addEventListener("click", async () => {
      if (dayInfo.approvedCount > 0) {
        calendarDetailsBody.innerHTML = `
          <div><strong>${date}</strong> 已预约 ${dayInfo.approvedCount} 条</div>
          <div style="margin-top:6px">单位：${dayInfo.companies.join("、") || "-"}</div>
        `;
      } else {
        calendarDetailsBody.innerHTML = `<div><strong>${date}</strong> 暂无已预约记录</div>`;
      }
      document.getElementById("qFrom").value = `${date}T00:00:00.000Z`;
      document.getElementById("qTo").value = `${date}T23:59:59.999Z`;
      switchTab("list");
      await loadApplications();
    });
    calendarEl.appendChild(cell);
  }
}

async function loadCalendar() {
  const month = calMonth.value.trim();
  const res = await fetch(`/api/admin/calendar?month=${encodeURIComponent(month)}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "加载日历失败");
  }
  renderCalendar(data.month, data.byDay || {});
}

document.getElementById("loadCalBtn").addEventListener("click", () => {
  loadCalendar().catch((e) => setMsg(e.message || "加载失败"));
});

function initMonth() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  calMonth.value = `${now.getFullYear()}-${m}`;
}

async function init() {
  initMonth();
  await loadFields();
  await loadApplications(1);
  await loadCalendar();
}

init().catch((e) => setMsg(e.message || "初始化失败"));
