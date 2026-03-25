const formEl = document.getElementById("visitorForm");
const msgEl = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const receiptEl = document.getElementById("receipt");
const debugVersionEl = document.getElementById("debugVersion");

function inferBasePath() {
  const pathname = window.location.pathname || "";
  if (pathname.endsWith("/visitor")) {
    return pathname.slice(0, -"/visitor".length);
  }
  if (pathname.endsWith("/admin")) {
    return pathname.slice(0, -"/admin".length);
  }
  return "";
}

const BASE_PATH = window.__BASE_PATH__ || inferBasePath();

let fields = [];
const uploads = {};
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function setMsg(text, ok = false) {
  msgEl.className = ok ? "ok" : "error";
  msgEl.textContent = text;
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

async function rollbackTempUpload(tempId) {
  if (!tempId) {
    return;
  }
  try {
    await fetch(`${BASE_PATH}/api/public/upload/${encodeURIComponent(tempId)}`, { method: "DELETE" });
  } catch (_e) {
    // Ignore rollback errors in demo.
  }
}

function ensureUploadList(fieldId) {
  if (!Array.isArray(uploads[fieldId])) {
    uploads[fieldId] = [];
  }
  return uploads[fieldId];
}

function formatSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0KB";
  }
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)}KB`;
  }
  return `${(kb / 1024).toFixed(2)}MB`;
}

function renderReceipt(applicationId) {
  const now = new Date().toLocaleString("zh-CN");
  receiptEl.innerHTML = `
    <h3>申请提交成功</h3>
    <p>申请编号：<strong>#${applicationId}</strong></p>
    <p>提交时间：${now}</p>
    <p>状态：已受理（Demo）</p>
  `;
  receiptEl.classList.remove("hidden");
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

async function loadForm() {
  const data = await requestJson(`${BASE_PATH}/api/public/form`, undefined, "加载表单失败");
  fields = data.fields;
  renderFields();
}

function renderFields() {
  formEl.innerHTML = "";
  fields.forEach((field) => {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = `${field.label}${field.required ? " *" : ""}`;
    wrap.appendChild(label);

    let input;
    let listEl = null;
    if (field.type === "select") {
      input = document.createElement("select");
      const d = document.createElement("option");
      d.value = "";
      d.textContent = "请选择";
      input.appendChild(d);
      field.options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
    } else if (field.type === "file") {
      input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.jpg,.jpeg,.png";
      listEl = document.createElement("div");
      listEl.className = "file-upload-list";

      const renderUploadList = () => {
        const list = ensureUploadList(field.id);
        listEl.innerHTML = "";
        if (list.length === 0) {
          const empty = document.createElement("div");
          empty.className = "hint";
          empty.textContent = "暂无附件";
          listEl.appendChild(empty);
          return;
        }

        list.forEach((item) => {
          const row = document.createElement("div");
          row.className = "file-upload-item";
          row.innerHTML = `
            <span class="name">${item.name} (${formatSize(item.size)})</span>
            <span class="actions">
              <button type="button" class="secondary" data-replace="${item.tempId}">替换</button>
              <button type="button" class="danger" data-remove="${item.tempId}">删除</button>
            </span>
          `;
          listEl.appendChild(row);
        });
      };

      const uploadOne = async (file, replaceTempId = null) => {
        if (!ALLOWED_MIME.includes(file.type)) {
          throw new Error("文件类型不支持，仅支持 pdf/jpg/jpeg/png");
        }
        if (file.size > MAX_FILE_SIZE) {
          throw new Error("文件超过 5MB 限制");
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("fieldId", String(field.id));
        const upData = await requestJson(
          `${BASE_PATH}/api/public/upload`,
          {
            method: "POST",
            body: formData
          },
          "上传失败"
        );

        const list = ensureUploadList(field.id);
        if (replaceTempId) {
          const idx = list.findIndex((x) => x.tempId === replaceTempId);
          if (idx >= 0) {
            const oldTempId = list[idx].tempId;
            list[idx] = {
              tempId: upData.tempId,
              name: upData.file.name,
              size: upData.file.size,
              url: upData.file.url
            };
            await rollbackTempUpload(oldTempId);
          } else {
            list.push({
              tempId: upData.tempId,
              name: upData.file.name,
              size: upData.file.size,
              url: upData.file.url
            });
          }
        } else {
          list.push({
            tempId: upData.tempId,
            name: upData.file.name,
            size: upData.file.size,
            url: upData.file.url
          });
        }
        renderUploadList();
        setMsg(`附件上传成功: ${upData.file.name}`, true);
      };

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) {
          return;
        }
        try {
          setMsg(`正在上传 ${file.name} ...`);
          await uploadOne(file);
        } catch (e) {
          setMsg(e.message || "上传失败");
        }
      });

      listEl.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) {
          return;
        }

        const removeTempId = target.dataset.remove;
        if (removeTempId) {
          const list = ensureUploadList(field.id);
          const idx = list.findIndex((x) => x.tempId === removeTempId);
          if (idx >= 0) {
            list.splice(idx, 1);
            await rollbackTempUpload(removeTempId);
            renderUploadList();
            setMsg("附件已删除", true);
          }
          return;
        }

        const replaceTempId = target.dataset.replace;
        if (replaceTempId) {
          const picker = document.createElement("input");
          picker.type = "file";
          picker.accept = ".pdf,.jpg,.jpeg,.png";
          picker.addEventListener("change", async () => {
            const file = picker.files?.[0];
            if (!file) {
              return;
            }
            try {
              setMsg(`正在替换 ${file.name} ...`);
              await uploadOne(file, replaceTempId);
              setMsg(`附件已替换: ${file.name}`, true);
            } catch (e) {
              setMsg(e.message || "替换失败");
            }
          });
          picker.click();
        }
      });

      renderUploadList();
    } else {
      input = document.createElement("input");
      if (field.key === "visit_time") {
        input.type = "date";
      } else {
        input.type = field.type === "number" ? "number" : "text";
        if (field.type === "number") {
          if (field.numberMin !== null && field.numberMin !== undefined) {
            input.min = String(field.numberMin);
          }
          if (field.numberMax !== null && field.numberMax !== undefined) {
            input.max = String(field.numberMax);
          }
        }
      }
    }

    input.id = `f_${field.id}`;
    input.dataset.type = field.type;
    input.dataset.required = String(field.required);
    wrap.appendChild(input);

    if (field.type === "file") {
      wrap.appendChild(listEl);
    }

    const err = document.createElement("div");
    err.className = "error";
    err.id = `err_${field.id}`;
    wrap.appendChild(err);

    formEl.appendChild(wrap);
  });
}

function validate() {
  let ok = true;
  fields.forEach((field) => {
    const errEl = document.getElementById(`err_${field.id}`);
    errEl.textContent = "";
    if (field.type === "file") {
      const fileList = ensureUploadList(field.id);
      if (field.required && fileList.length === 0) {
        errEl.textContent = "请上传文件";
        ok = false;
      }
      return;
    }
    const el = document.getElementById(`f_${field.id}`);
    const value = (el.value || "").trim();
    if (field.required && !value) {
      errEl.textContent = "必填";
      ok = false;
      return;
    }
    if (value && field.type === "number" && Number.isNaN(Number(value))) {
      errEl.textContent = "必须是数字";
      ok = false;
      return;
    }
    if (value && field.type === "number") {
      const n = Number(value);
      if (field.numberMin !== null && field.numberMin !== undefined && n < Number(field.numberMin)) {
        errEl.textContent = `不能小于 ${field.numberMin}`;
        ok = false;
        return;
      }
      if (field.numberMax !== null && field.numberMax !== undefined && n > Number(field.numberMax)) {
        errEl.textContent = `不能大于 ${field.numberMax}`;
        ok = false;
      }
    }
  });
  return ok;
}

async function submit() {
  receiptEl.classList.add("hidden");
  receiptEl.innerHTML = "";

  if (!validate()) {
    setMsg("请先修正表单错误");
    return;
  }

  const values = {};
  fields.forEach((field) => {
    if (field.type === "file") {
      return;
    }
    const v = document.getElementById(`f_${field.id}`).value;
    if (String(v).trim() !== "") {
      values[field.id] = v;
    }
  });

  submitBtn.disabled = true;
  try {
    const fileUploads = {};
    Object.entries(uploads).forEach(([fieldId, list]) => {
      if (!Array.isArray(list) || list.length === 0) {
        return;
      }
      fileUploads[fieldId] = list.map((item) => item.tempId).filter(Boolean);
    });

    setMsg("提交中...");
    const data = await requestJson(
      `${BASE_PATH}/api/public/applications`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, uploads: fileUploads })
      },
      "提交失败"
    );
    setMsg(`提交成功，申请编号 #${data.applicationId}`, true);
    renderReceipt(data.applicationId);
    formEl.reset();
    Object.keys(uploads).forEach((k) => {
      delete uploads[k];
    });
  } catch (e) {
    setMsg(e.message || "提交失败");
  } finally {
    submitBtn.disabled = false;
  }
}

submitBtn.addEventListener("click", submit);

loadVersion();
loadForm().catch((e) => setMsg(e.message || "加载失败"));
