const formEl = document.getElementById("visitorForm");
const msgEl = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const receiptEl = document.getElementById("receipt");

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

async function loadForm() {
  const res = await fetch(`${BASE_PATH}/api/public/form`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || "加载表单失败");
  }
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
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
          const oldTemp = uploads[field.id];
          delete uploads[field.id];
          await rollbackTempUpload(oldTemp);
          return;
        }

        if (!ALLOWED_MIME.includes(file.type)) {
          setMsg("文件类型不支持，仅支持 pdf/jpg/jpeg/png");
          input.value = "";
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          setMsg("文件超过 5MB 限制");
          input.value = "";
          return;
        }

        const previousTemp = uploads[field.id];
        try {
          setMsg(`正在上传 ${file.name} ...`);
          const formData = new FormData();
          formData.append("file", file);
          formData.append("fieldId", String(field.id));
          const upRes = await fetch(`${BASE_PATH}/api/public/upload`, {
            method: "POST",
            body: formData
          });
          const upData = await upRes.json();
          if (!upData.success) {
            throw new Error(upData.message || "上传失败");
          }
          uploads[field.id] = upData.tempId;
          if (previousTemp) {
            await rollbackTempUpload(previousTemp);
          }
          setMsg(`附件上传成功: ${upData.file.name}`, true);
        } catch (e) {
          delete uploads[field.id];
          input.value = "";
          if (previousTemp) {
            await rollbackTempUpload(previousTemp);
          }
          setMsg(e.message || "上传失败");
        }
      });
    } else {
      input = document.createElement("input");
      if (field.key === "visit_time") {
        input.type = "datetime-local";
      } else {
        input.type = field.type === "number" ? "number" : "text";
      }
    }

    input.id = `f_${field.id}`;
    input.dataset.type = field.type;
    input.dataset.required = String(field.required);
    wrap.appendChild(input);

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
      if (field.required && !uploads[field.id]) {
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
    setMsg("提交中...");
    const res = await fetch(`${BASE_PATH}/api/public/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, uploads })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || "提交失败");
    }
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

loadForm().catch((e) => setMsg(e.message || "加载失败"));
