const BASE_PATH = (() => {
  const pathSegments = window.location.pathname.split("/");
  for (let i = pathSegments.length - 1; i >= 0; i--) {
    if (pathSegments[i] === "admin" || pathSegments[i] === "analytics") {
      return pathSegments.slice(0, i).join("/") || "/";
    }
  }
  return "/";
})();

const API_BASE = `${BASE_PATH}/api/admin`;

// 初始化日期选择器（默认过去30天）
function initDatePickers() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const formatDate = (date) => date.toISOString().split("T")[0];

  document.getElementById("filterFromDate").value = formatDate(thirtyDaysAgo);
  document.getElementById("filterToDate").value = formatDate(today);
}

// 获取仪表板数据
async function loadDashboard() {
  const fromDate = document.getElementById("filterFromDate").value;
  const toDate = document.getElementById("filterToDate").value;

  try {
    const response = await fetch(
      `${API_BASE}/analytics/dashboard?fromDate=${fromDate}&toDate=${toDate}`
    );
    const result = await response.json();

    if (!result.success) {
      showError(result.message || "加载失败");
      return;
    }

    const data = result.data;
    document.getElementById("statTotal").textContent = data.total;
    document.getElementById("statPending").textContent = data.pending;
    document.getElementById("statApproved").textContent = data.approved;
    document.getElementById("statRejected").textContent = data.rejected;
    document.getElementById("approvalRateText").textContent =
      `通过率 ${data.approvalRate}%`;

    // 绘制状态分布图
    drawStatusChart(data);
  } catch (error) {
    console.error("加载仪表板失败:", error);
    showError("加载仪表板失败");
  }
}

// 绘制状态分布柱状图
function drawStatusChart(data) {
  const maxCount = Math.max(
    data.pending || 0,
    data.approved || 0,
    data.rejected || 0,
    1
  );
  const getColor = (status) => {
    switch (status) {
      case "pending":
        return "#f59e0b";
      case "approved":
        return "#10b981";
      case "rejected":
        return "#ef4444";
      default:
        return "#3b82f6";
    }
  };

  const statusLabels = [
    { key: "pending", label: "待审批", value: data.pending, color: "#f59e0b" },
    {
      key: "approved",
      label: "已通过",
      value: data.approved,
      color: "#10b981"
    },
    {
      key: "rejected",
      label: "已驳回",
      value: data.rejected,
      color: "#ef4444"
    }
  ];

  let html = "";
  for (const stat of statusLabels) {
    const percentage = maxCount > 0 ? (stat.value / maxCount) * 100 : 0;
    html += `
      <div class="status-bar">
        <div class="bar-visual">
          <div class="bar-fill" style="width: ${percentage}%; background: ${stat.color}">
            ${stat.value > 0 ? stat.value : ""}
          </div>
        </div>
        <div class="bar-label">${stat.label}</div>
      </div>
    `;
  }

  document.getElementById("statusChart").innerHTML = html;
}

// 加载时间线数据
async function loadTimeline() {
  const fromDate = document.getElementById("filterFromDate").value;
  const toDate = document.getElementById("filterToDate").value;

  try {
    const response = await fetch(
      `${API_BASE}/analytics/timeline?fromDate=${fromDate}&toDate=${toDate}&granularity=day`
    );
    const result = await response.json();

    if (!result.success) {
      showError(result.message || "加载时间线失败");
      return;
    }

    drawTimelineChart(result.data);
  } catch (error) {
    console.error("加载时间线失败:", error);
    showError("加载时间线失败");
  }
}

// 绘制时间线图表
function drawTimelineChart(data) {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");

  if (!data || data.length === 0) {
    document.getElementById("timelineChart").innerHTML =
      '<div class="chart-placeholder">暂无数据</div>';
    return;
  }

  const maxTotal = Math.max(...data.map((d) => d.total), 1);
  const width = 400;
  const height = 150;
  const padding = 20;
  const stepWidth = (width - padding * 2) / Math.max(data.length - 1, 1);

  // 绘制网格线
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (i * height) / 4;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // 绘制线条和点
  const colors = {
    pending: "#f59e0b",
    approved: "#10b981",
    rejected: "#ef4444"
  };

  for (const status of ["pending", "approved", "rejected"]) {
    ctx.strokeStyle = colors[status];
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = padding + i * stepWidth;
      const y =
        height +
        padding -
        (data[i][status] / maxTotal) * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // 绘制图例
  ctx.fillStyle = "#666";
  ctx.font = "12px sans-serif";
  ctx.fillText("—— 待审批", 20, height + padding + 20);
  ctx.fillText("—— 已通过", 120, height + padding + 20);
  ctx.fillText("—— 已驳回", 220, height + padding + 20);
  ctx.strokeStyle = "#f59e0b";
  ctx.beginPath();
  ctx.moveTo(5, height + padding + 15);
  ctx.lineTo(15, height + padding + 15);
  ctx.stroke();

  ctx.strokeStyle = "#10b981";
  ctx.beginPath();
  ctx.moveTo(105, height + padding + 15);
  ctx.lineTo(115, height + padding + 15);
  ctx.stroke();

  ctx.strokeStyle = "#ef4444";
  ctx.beginPath();
  ctx.moveTo(205, height + padding + 15);
  ctx.lineTo(215, height + padding + 15);
  ctx.stroke();

  document.getElementById("timelineChart").innerHTML = "";
  document.getElementById("timelineChart").appendChild(canvas);
}

// 加载字段列表
async function loadFieldList() {
  try {
    const response = await fetch(`${API_BASE}/fields`);
    const result = await response.json();

    if (!result.success) {
      return;
    }

    const fields = result.fields;
    const select = document.getElementById("fieldSelect");

    for (const field of fields) {
      const option = document.createElement("option");
      option.value = field.id;
      option.textContent = field.label;
      select.appendChild(option);
    }

    if (fields.length > 0) {
      select.value = fields[0].id;
      loadFieldStats(fields[0].id);
    }
  } catch (error) {
    console.error("加载字段列表失败:", error);
  }
}

// 加载字段统计数据
async function loadFieldStats(fieldId) {
  if (!fieldId) {
    document.getElementById("fieldStatsContent").innerHTML = "";
    return;
  }

  const fromDate = document.getElementById("filterFromDate").value;
  const toDate = document.getElementById("filterToDate").value;

  try {
    const response = await fetch(
      `${API_BASE}/analytics/field?fieldId=${fieldId}&fromDate=${fromDate}&toDate=${toDate}`
    );
    const result = await response.json();

    if (!result.success) {
      showError(result.message || "加载字段统计失败");
      return;
    }

    renderFieldStats(result.field, result.data);
  } catch (error) {
    console.error("加载字段统计失败:", error);
    showError("加载字段统计失败");
  }
}

// 渲染字段统计表格
function renderFieldStats(field, data) {
  if (!data || data.length === 0) {
    document.getElementById("fieldStatsContent").innerHTML =
      '<div class="chart-placeholder">暂无数据</div>';
    return;
  }

  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  let html = '<table class="stats-table"><thead><tr><th>值</th><th>计数</th><th>占比</th></tr></thead><tbody>';

  for (const item of data) {
    const percentage = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : "0.0";
    html += `
      <tr>
        <td>${escapeHtml(item.label || "-")}</td>
        <td>${item.count}</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%">${percentage}%</div>
          </div>
        </td>
      </tr>
    `;
  }

  html += "</tbody></table>";
  document.getElementById("fieldStatsContent").innerHTML = html;
}

// 导出 CSV
async function exportCSV() {
  const fromDate = document.getElementById("filterFromDate").value;
  const toDate = document.getElementById("filterToDate").value;

  try {
    const url = `${API_BASE}/analytics/export?fromDate=${fromDate}&toDate=${toDate}`;
    const response = await fetch(url);
    if (!response.ok) {
      showError("导出失败");
      return;
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `statistics_${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error("导出失败:", error);
    showError("导出失败");
  }
}

// 显示错误消息
function showError(message) {
  const container = document.querySelector(".analytics-container");
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  container.insertBefore(errorDiv, container.firstChild);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

// 转义 HTML
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

// 初始化页面
function init() {
  initDatePickers();
  loadDashboard();
  loadTimeline();
  loadFieldList();

  document.getElementById("btnRefresh").addEventListener("click", () => {
    loadDashboard();
    loadTimeline();
    const fieldId = document.getElementById("fieldSelect").value;
    if (fieldId) {
      loadFieldStats(fieldId);
    }
  });

  document.getElementById("btnExport").addEventListener("click", exportCSV);

  document.getElementById("btnBack").addEventListener("click", () => {
    window.location.href = `${BASE_PATH}/admin`;
  });

  document.getElementById("fieldSelect").addEventListener("change", (e) => {
    loadFieldStats(e.target.value);
  });
}

document.addEventListener("DOMContentLoaded", init);
