import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import dayjs from "dayjs";
import db, { initDb } from "./db.js";
import { ALLOWED_MIME, FIELD_TYPES, MAX_FILE_SIZE } from "./constants.js";

const app = express();
const DEFAULT_CONFIG = {
  port: 3000,
  basePath: "/visit"
};

function normalizeBasePath(rawPath) {
  const text = String(rawPath ?? "").trim();
  if (!text || text === "/") {
    return "";
  }
  const withLeadingSlash = text.startsWith("/") ? text : `/${text}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function loadAppConfig() {
  const configPath = path.resolve("config/app.config.json");
  let fileConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (err) {
      console.warn("[config] app.config.json 解析失败，将使用默认配置", err.message);
    }
  }

  const portCandidate = process.env.PORT ?? fileConfig.port ?? DEFAULT_CONFIG.port;
  const port = Number(portCandidate);
  const basePath = normalizeBasePath(process.env.BASE_PATH ?? fileConfig.basePath ?? DEFAULT_CONFIG.basePath);

  return {
    port: Number.isInteger(port) && port > 0 ? port : DEFAULT_CONFIG.port,
    basePath
  };
}

const runtimeConfig = loadAppConfig();
const PORT = runtimeConfig.port;
const BASE_PATH = runtimeConfig.basePath;
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));
    return String(pkg.version || "unknown");
  } catch (_err) {
    return "unknown";
  }
})();
const REJECT_REASONS = {
  date_conflict: "日期冲突",
  letter_invalid: "公函不合格",
  info_incomplete: "资料不完整",
  other: "其他"
};

initDb();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve("uploads/runtime"));
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new Error("不支持的文件类型"));
      return;
    }
    cb(null, true);
  }
});

function getActiveFields() {
  const rows = db
    .prepare("SELECT * FROM form_fields WHERE active = 1 ORDER BY sort_order ASC, id ASC")
    .all();
  return rows.map((row) => {
    const parsed = row.options_json ? JSON.parse(row.options_json) : null;
    const base = {
      id: row.id,
      key: row.field_key,
      label: row.label,
      type: row.type,
      required: Boolean(row.required)
    };

    if (row.type === "select") {
      return {
        ...base,
        options: Array.isArray(parsed) ? parsed : []
      };
    }

    if (row.type === "number") {
      const min = parsed && typeof parsed === "object" ? parsed.min : undefined;
      const max = parsed && typeof parsed === "object" ? parsed.max : undefined;
      return {
        ...base,
        options: [],
        numberMin: Number.isFinite(Number(min)) ? Number(min) : null,
        numberMax: Number.isFinite(Number(max)) ? Number(max) : null
      };
    }

    return {
      ...base,
      options: []
    };
  });
}

function cleanupTempUploads(tempIds) {
  if (!Array.isArray(tempIds) || tempIds.length === 0) {
    return;
  }

  const getTemp = db.prepare("SELECT * FROM temp_uploads WHERE temp_id = ?");
  const delTemp = db.prepare("DELETE FROM temp_uploads WHERE temp_id = ?");
  const uniqueIds = Array.from(new Set(tempIds.filter(Boolean)));

  for (const tempId of uniqueIds) {
    const temp = getTemp.get(tempId);
    if (!temp) {
      continue;
    }
    const runtimePath = path.resolve(temp.path.slice(1));
    if (fs.existsSync(runtimePath)) {
      fs.unlinkSync(runtimePath);
    }
    delTemp.run(tempId);
  }
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function buildFieldOptionsJson(input) {
  if (input.type === "select") {
    return JSON.stringify(input.options || []);
  }
  if (input.type === "number") {
    const min = normalizeOptionalNumber(input.numberMin);
    const max = normalizeOptionalNumber(input.numberMax);
    if (min === null && max === null) {
      return null;
    }
    return JSON.stringify({
      ...(min !== null ? { min } : {}),
      ...(max !== null ? { max } : {})
    });
  }
  return null;
}

function validateFieldDefinition(input) {
  const { key, label, type, required, options, numberMin, numberMax } = input;
  if (!key || !/^[a-zA-Z][a-zA-Z0-9_]{2,32}$/.test(key)) {
    return "字段 key 必须是 3-33 位字母数字下划线，且以字母开头";
  }
  if (!label || label.trim().length < 2) {
    return "字段名称至少 2 个字符";
  }
  if (!FIELD_TYPES.includes(type)) {
    return "字段类型不合法";
  }
  if (typeof required !== "boolean") {
    return "required 必须是布尔值";
  }
  if (type === "select") {
    if (!Array.isArray(options) || options.length === 0) {
      return "选择类型必须至少提供一个选项";
    }
  }
  if (type === "number") {
    const min = normalizeOptionalNumber(numberMin);
    const max = normalizeOptionalNumber(numberMax);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      return "数字范围必须是合法数字";
    }
    if (min !== null && max !== null && min > max) {
      return "数字范围最小值不能大于最大值";
    }
  }
  return null;
}

function isFixedFieldByKey(key) {
  return String(key || "").trim() === "visit_time";
}

function getVisitTimeField() {
  return db.prepare("SELECT id, field_key, label FROM form_fields WHERE active = 1 AND field_key = 'visit_time' LIMIT 1").get();
}

function extractCompanyName(values, fieldMap) {
  const preferred = values.find((v) => {
    const field = fieldMap.get(v.field_id);
    if (!field) {
      return false;
    }
    const haystack = `${field.key} ${field.label}`;
    return /company|unit|单位|公司/i.test(haystack);
  });
  if (!preferred) {
    return "-";
  }
  const value = preferred.value_text ?? preferred.value_select ?? preferred.value_number;
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function error(res, message, code = 400) {
  res.status(code).json({ success: false, message });
}

function withBasePath(urlPath) {
  if (!urlPath.startsWith("/")) {
    return `${BASE_PATH}/${urlPath}`;
  }
  return `${BASE_PATH}${urlPath}`;
}

function normalizeUploadTempIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  }
  const single = String(raw || "").trim();
  return single ? [single] : [];
}

function getNoticeContent() {
  const row = db
    .prepare("SELECT setting_value, updated_at FROM app_settings WHERE setting_key = 'notice_content' LIMIT 1")
    .get();
  if (!row) {
    return { content: "", updatedAt: null };
  }
  return {
    content: row.setting_value || "",
    updatedAt: row.updated_at || null
  };
}

function saveNoticeContent(content) {
  const now = new Date().toISOString();
  const result = db
    .prepare("UPDATE app_settings SET setting_value = ?, updated_at = ? WHERE setting_key = 'notice_content'")
    .run(String(content || ""), now);
  if (result.changes === 0) {
    db.prepare("INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)").run(
      "notice_content",
      String(content || ""),
      now
    );
  }
  return now;
}

app.get("/health", (_req, res) => {
  res.json({ success: true, now: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.redirect(`${BASE_PATH}/visitor`);
});

app.get(`${BASE_PATH}/visitor`, (_req, res) => {
  res.sendFile(path.resolve("apps/web/visitor.html"));
});

app.get(`${BASE_PATH}/admin`, (_req, res) => {
  res.sendFile(path.resolve("apps/web/admin.html"));
});

app.get(`${BASE_PATH}/notice`, (_req, res) => {
  res.sendFile(path.resolve("apps/web/notice.html"));
});

app.use(`${BASE_PATH}/uploads`, express.static(path.resolve("uploads")));
app.use(BASE_PATH || "/", express.static(path.resolve("apps/web")));

app.get(`${BASE_PATH}/api/public/form`, (_req, res) => {
  res.json({ success: true, fields: getActiveFields() });
});

app.get(`${BASE_PATH}/api/public/version`, (_req, res) => {
  res.json({ success: true, version: APP_VERSION, basePath: BASE_PATH || "/" });
});

app.get(`${BASE_PATH}/api/public/notice`, (_req, res) => {
  const notice = getNoticeContent();
  res.json({ success: true, content: notice.content, updatedAt: notice.updatedAt });
});

app.get(`${BASE_PATH}/api/admin/notice`, (_req, res) => {
  const notice = getNoticeContent();
  res.json({ success: true, content: notice.content, updatedAt: notice.updatedAt });
});

app.put(`${BASE_PATH}/api/admin/notice`, (req, res) => {
  const content = String(req.body?.content || "");
  const updatedAt = saveNoticeContent(content);
  res.json({ success: true, updatedAt });
});

app.post(`${BASE_PATH}/api/public/upload`, upload.single("file"), (req, res) => {
  const fieldId = Number(req.body.fieldId);
  if (!fieldId || Number.isNaN(fieldId)) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return error(res, "fieldId 不合法");
  }

  const exists = db.prepare("SELECT id FROM form_fields WHERE id = ? AND active = 1 AND type = 'file'").get(fieldId);
  if (!exists) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return error(res, "文件字段不存在");
  }

  const tempId = `tmp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO temp_uploads (temp_id, field_id, original_name, stored_name, mime_type, size, path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tempId,
    fieldId,
    req.file.originalname,
    req.file.filename,
    req.file.mimetype,
    req.file.size,
    `/uploads/runtime/${req.file.filename}`,
    now
  );

  res.json({
    success: true,
    tempId,
    file: {
      name: req.file.originalname,
      size: req.file.size,
      url: withBasePath(`/uploads/runtime/${req.file.filename}`)
    }
  });
});

app.delete(`${BASE_PATH}/api/public/upload/:tempId`, (req, res) => {
  const tempId = String(req.params.tempId || "").trim();
  if (!tempId) {
    return error(res, "tempId 不合法");
  }
  cleanupTempUploads([tempId]);
  res.json({ success: true });
});

app.post(`${BASE_PATH}/api/public/applications`, (req, res) => {
  const fields = getActiveFields();
  const payload = req.body?.values || {};
  const uploads = req.body?.uploads || {};

  const missing = [];
  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    if (field.type === "file") {
      const tempIds = normalizeUploadTempIds(uploads[field.id]);
      if (tempIds.length === 0) {
        missing.push(field.label);
      }
      continue;
    }
    const value = payload[field.id];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.push(field.label);
    }
  }

  if (missing.length > 0) {
    return error(res, `以下必填项缺失: ${missing.join("、")}`);
  }

  for (const field of fields) {
    const value = payload[field.id];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (field.type === "number") {
      if (Number.isNaN(Number(value))) {
        return error(res, `${field.label} 必须是数字`);
      }
      const n = Number(value);
      if (field.numberMin !== null && n < field.numberMin) {
        return error(res, `${field.label} 不能小于 ${field.numberMin}`);
      }
      if (field.numberMax !== null && n > field.numberMax) {
        return error(res, `${field.label} 不能大于 ${field.numberMax}`);
      }
    }
    if (field.type === "select") {
      if (!field.options.includes(String(value))) {
        return error(res, `${field.label} 选项无效`);
      }
    }
  }

  const now = new Date().toISOString();
  const createApp = db.prepare("INSERT INTO applications (status, created_at) VALUES ('pending', ?)");
  const insertValue = db.prepare(
    `INSERT INTO application_values (application_id, field_id, value_text, value_number, value_select, created_at)
     VALUES (@application_id, @field_id, @value_text, @value_number, @value_select, @created_at)`
  );
  const getTemp = db.prepare("SELECT * FROM temp_uploads WHERE temp_id = ?");
  const insertFile = db.prepare(
    `INSERT INTO application_files (application_id, field_id, original_name, stored_name, mime_type, size, path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const delTemp = db.prepare("DELETE FROM temp_uploads WHERE temp_id = ?");

  const tx = db.transaction(() => {
    const appRow = createApp.run(now);
    const applicationId = Number(appRow.lastInsertRowid);

    for (const field of fields) {
      if (field.type === "file") {
        const tempIds = normalizeUploadTempIds(uploads[field.id]);
        if (tempIds.length === 0) {
          continue;
        }
        for (const tempId of tempIds) {
          const temp = getTemp.get(tempId);
          if (!temp) {
            throw new Error(`附件已失效: ${field.label}`);
          }
          const runtimePath = path.resolve(temp.path.slice(1));
          const finalName = `${applicationId}_${temp.stored_name}`;
          const finalDiskPath = path.resolve("uploads", finalName);
          if (fs.existsSync(runtimePath)) {
            fs.renameSync(runtimePath, finalDiskPath);
          }
          insertFile.run(
            applicationId,
            field.id,
            temp.original_name,
            finalName,
            temp.mime_type,
            temp.size,
            `/uploads/${finalName}`,
            now
          );
          delTemp.run(tempId);
        }
        continue;
      }

      const raw = payload[field.id];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        continue;
      }
      insertValue.run({
        application_id: applicationId,
        field_id: field.id,
        value_text: field.type === "text" ? String(raw) : null,
        value_number: field.type === "number" ? Number(raw) : null,
        value_select: field.type === "select" ? String(raw) : null,
        created_at: now
      });
    }

    return applicationId;
  });

  try {
    const applicationId = tx();
    res.status(201).json({ success: true, applicationId });
  } catch (e) {
    const cleanupIds = [];
    for (const val of Object.values(uploads)) {
      cleanupIds.push(...normalizeUploadTempIds(val));
    }
    cleanupTempUploads(cleanupIds);
    error(res, e.message || "提交失败", 500);
  }
});

app.get(`${BASE_PATH}/api/admin/fields`, (_req, res) => {
  res.json({ success: true, fields: getActiveFields() });
});

app.post(`${BASE_PATH}/api/admin/fields`, (req, res) => {
  const body = req.body || {};
  const msg = validateFieldDefinition(body);
  if (msg) {
    return error(res, msg);
  }

  const maxOrder =
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM form_fields WHERE active = 1").get().max_order || 0;
  const now = new Date().toISOString();

  const existed = db
    .prepare("SELECT id, active, field_key FROM form_fields WHERE field_key = ? ORDER BY id ASC LIMIT 1")
    .get(body.key);

  if (existed && existed.active) {
    return error(res, "字段 key 已存在");
  }

  // If this key was soft-deleted before, reactivate and overwrite with new definition.
  if (existed && !existed.active) {
    const result = db
      .prepare(
        `UPDATE form_fields
         SET label = ?, type = ?, required = ?, options_json = ?, sort_order = ?, active = 1, updated_at = ?
         WHERE id = ?`
      )
      .run(
        body.label.trim(),
        body.type,
        body.required ? 1 : 0,
        buildFieldOptionsJson(body),
        Number(body.sortOrder || maxOrder + 1),
        now,
        existed.id
      );

    if (result.changes > 0) {
      return res.status(201).json({ success: true, id: existed.id, restored: true });
    }
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO form_fields (field_key, label, type, required, options_json, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        body.key,
        body.label.trim(),
        body.type,
        body.required ? 1 : 0,
        buildFieldOptionsJson(body),
        Number(body.sortOrder || maxOrder + 1),
        now,
        now
      );

    res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (e) {
    error(res, "字段 key 重复或数据不合法");
  }
});

app.put(`${BASE_PATH}/api/admin/fields/:id`, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return error(res, "字段 ID 不合法");
  }
  const body = req.body || {};
  const msg = validateFieldDefinition(body);
  if (msg) {
    return error(res, msg);
  }

  const current = db.prepare("SELECT id, field_key FROM form_fields WHERE id = ? AND active = 1").get(id);
  if (!current) {
    return error(res, "字段不存在", 404);
  }
  if (isFixedFieldByKey(current.field_key)) {
    if (!isFixedFieldByKey(body.key) || body.required !== true || body.type !== "text") {
      return error(res, "来访时间为固定必填项，不允许修改 key/类型/必填属性");
    }
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE form_fields
       SET field_key = ?, label = ?, type = ?, required = ?, options_json = ?, sort_order = ?, updated_at = ?
       WHERE id = ? AND active = 1`
    )
    .run(
      body.key,
      body.label.trim(),
      body.type,
      body.required ? 1 : 0,
      buildFieldOptionsJson(body),
      Number(body.sortOrder || id),
      now,
      id
    );

  if (result.changes === 0) {
    return error(res, "字段不存在", 404);
  }

  res.json({ success: true });
});

app.patch(`${BASE_PATH}/api/admin/fields/reorder`, (req, res) => {
  const orderedIds = req.body?.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return error(res, "orderedIds 不能为空");
  }

  const ids = orderedIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length !== orderedIds.length || new Set(ids).size !== ids.length) {
    return error(res, "orderedIds 不合法");
  }

  const active = db.prepare("SELECT id FROM form_fields WHERE active = 1").all().map((row) => row.id);
  if (active.length !== ids.length) {
    return error(res, "排序字段数量与当前字段不一致");
  }
  const activeSet = new Set(active);
  for (const id of ids) {
    if (!activeSet.has(id)) {
      return error(res, "排序字段包含不存在的 ID");
    }
  }

  const now = new Date().toISOString();
  const update = db.prepare("UPDATE form_fields SET sort_order = ?, updated_at = ? WHERE id = ? AND active = 1");
  const tx = db.transaction(() => {
    ids.forEach((id, index) => {
      update.run(index + 1, now, id);
    });
  });

  tx();
  res.json({ success: true });
});

app.delete(`${BASE_PATH}/api/admin/fields/:id`, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return error(res, "字段 ID 不合法");
  }
  const field = db.prepare("SELECT field_key FROM form_fields WHERE id = ? AND active = 1").get(id);
  if (!field) {
    return error(res, "字段不存在", 404);
  }
  if (isFixedFieldByKey(field.field_key)) {
    return error(res, "来访时间为固定项，不允许删除");
  }
  const result = db
    .prepare("UPDATE form_fields SET active = 0, updated_at = ? WHERE id = ? AND active = 1")
    .run(new Date().toISOString(), id);

  if (result.changes === 0) {
    return error(res, "字段不存在", 404);
  }
  res.json({ success: true });
});

app.get(`${BASE_PATH}/api/admin/applications`, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 10)));
  const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : "";
  const toDate = req.query.toDate ? String(req.query.toDate).trim() : "";
  const q = req.query.q ? String(req.query.q).trim() : "";
  const visitTimeField = getVisitTimeField();

  if (fromDate && toDate && fromDate > toDate) {
    return error(res, "开始日期不能晚于结束日期");
  }

  const conditions = [];
  const params = [];
  if (!visitTimeField) {
    return error(res, "系统缺少来访时间字段");
  }
  if (fromDate) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM application_values avf
        WHERE avf.application_id = applications.id
        AND avf.field_id = ?
        AND substr(avf.value_text, 1, 10) >= ?
      )`
    );
    params.push(visitTimeField.id, fromDate);
  }
  if (toDate) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM application_values avt
        WHERE avt.application_id = applications.id
        AND avt.field_id = ?
        AND substr(avt.value_text, 1, 10) <= ?
      )`
    );
    params.push(visitTimeField.id, toDate);
  }
  const status = req.query.status ? String(req.query.status).trim() : "";
  if (status) {
    conditions.push("applications.status = ?");
    params.push(status);
  }
  if (q) {
    const kw = `%${q}%`;
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM application_values av
        WHERE av.application_id = applications.id
        AND (
          av.value_text LIKE ?
          OR av.value_select LIKE ?
          OR CAST(av.value_number AS TEXT) LIKE ?
        )
      )
      OR EXISTS (
        SELECT 1 FROM application_files af
        WHERE af.application_id = applications.id
        AND af.original_name LIKE ?
      )
    )`);
    params.push(kw, kw, kw, kw);
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM applications ${whereSql}`)
    .get(...params).c;

  const rows = db
    .prepare(
      `SELECT id, created_at, status, reject_reason_code, reject_reason_text, decision_at FROM applications ${whereSql}
       ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  const fieldMap = new Map(getActiveFields().map((f) => [f.id, f]));
  const valueStmt = db.prepare(
    "SELECT field_id, value_text, value_number, value_select FROM application_values WHERE application_id = ?"
  );
  const fileStmt = db.prepare(
    "SELECT field_id, original_name, path FROM application_files WHERE application_id = ?"
  );

  const items = rows.map((row) => {
    const values = valueStmt.all(row.id);
    const files = fileStmt.all(row.id);
    const data = {};

    for (const v of values) {
      const field = fieldMap.get(v.field_id);
      const name = field ? field.label : `字段${v.field_id}`;
      data[name] = v.value_text ?? v.value_number ?? v.value_select;
    }
    for (const f of files) {
      const field = fieldMap.get(f.field_id);
      const name = field ? field.label : `文件字段${f.field_id}`;
      const url = f.path.startsWith(`${BASE_PATH}/`) ? f.path : withBasePath(f.path);
      const fileItem = { name: f.original_name, url };
      if (!Object.prototype.hasOwnProperty.call(data, name)) {
        data[name] = fileItem;
        continue;
      }
      if (Array.isArray(data[name])) {
        data[name].push(fileItem);
      } else {
        data[name] = [data[name], fileItem];
      }
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      status: row.status,
      rejectReasonCode: row.reject_reason_code,
      rejectReasonText: row.reject_reason_text,
      decisionAt: row.decision_at,
      companyName: extractCompanyName(values, fieldMap),
      data
    };
  });

  res.json({
    success: true,
    page,
    pageSize,
    timeType: "visit",
    fromDate,
    toDate,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items
  });
});

app.patch(`${BASE_PATH}/api/admin/applications/:id/decision`, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return error(res, "申请 ID 不合法");
  }

  const decision = String(req.body?.decision || "").trim();
  if (decision !== "approved" && decision !== "rejected") {
    return error(res, "decision 仅支持 approved 或 rejected");
  }

  const exists = db.prepare("SELECT id FROM applications WHERE id = ?").get(id);
  if (!exists) {
    return error(res, "申请不存在", 404);
  }

  const now = new Date().toISOString();

  if (decision === "approved") {
    db.prepare(
      "UPDATE applications SET status = 'approved', reject_reason_code = NULL, reject_reason_text = NULL, decision_at = ? WHERE id = ?"
    ).run(now, id);
    return res.json({ success: true });
  }

  const reasonCode = String(req.body?.reasonCode || "").trim();
  const reasonText = String(req.body?.reasonText || "").trim();
  const hasPreset = reasonCode && Object.prototype.hasOwnProperty.call(REJECT_REASONS, reasonCode);
  if (!hasPreset && !reasonText) {
    return error(res, "驳回时必须填写理由或选择预设理由");
  }

  const finalReasonText = reasonText || REJECT_REASONS[reasonCode];
  db.prepare(
    "UPDATE applications SET status = 'rejected', reject_reason_code = ?, reject_reason_text = ?, decision_at = ? WHERE id = ?"
  ).run(hasPreset ? reasonCode : null, finalReasonText, now, id);

  res.json({ success: true });
});

app.get(`${BASE_PATH}/api/admin/calendar`, (req, res) => {
  const month = String(req.query.month || dayjs().format("YYYY-MM"));
  const start = dayjs(`${month}-01`).startOf("month");
  const end = start.endOf("month");
  const visitTimeField = getVisitTimeField();

  if (!visitTimeField) {
    return res.json({ success: true, month, byDay: {} });
  }

  const rows = db
    .prepare(
      `SELECT substr(av.value_text, 1, 10) AS day, COUNT(*) AS count
       FROM applications a
       JOIN application_values av ON av.application_id = a.id
       WHERE av.field_id = ?
       AND av.value_text >= ?
       AND av.value_text <= ?
       GROUP BY substr(av.value_text, 1, 10)
       ORDER BY day ASC`
    )
    .all(visitTimeField.id, start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD") + "T23:59:59");

  const byDay = {};
  for (const row of rows) {
    byDay[row.day] = { totalCount: row.count, approvedCount: 0, pendingCount: 0, companies: [] };
  }

  const approvedRows = db
    .prepare(
      `SELECT a.id, substr(av.value_text, 1, 10) AS day
       FROM applications a
       JOIN application_values av ON av.application_id = a.id
       WHERE av.field_id = ?
       AND av.value_text >= ?
       AND av.value_text <= ?
       AND a.status = 'approved'
       ORDER BY a.id DESC`
    )
    .all(visitTimeField.id, start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD") + "T23:59:59");

  const fieldMap = new Map(getActiveFields().map((f) => [f.id, f]));
  const valueStmt = db.prepare(
    "SELECT field_id, value_text, value_number, value_select FROM application_values WHERE application_id = ?"
  );

  for (const row of approvedRows) {
    if (!byDay[row.day]) {
      byDay[row.day] = { totalCount: 0, approvedCount: 0, pendingCount: 0, companies: [] };
    }
    const values = valueStmt.all(row.id);
    const companyName = extractCompanyName(values, fieldMap);
    const current = byDay[row.day];
    current.approvedCount += 1;
    if (companyName !== "-" && !current.companies.includes(companyName)) {
      current.companies.push(companyName);
    }
  }

  const pendingRows = db
    .prepare(
      `SELECT substr(av.value_text, 1, 10) AS day, COUNT(*) AS count
       FROM applications a
       JOIN application_values av ON av.application_id = a.id
       WHERE av.field_id = ?
       AND av.value_text >= ?
       AND av.value_text <= ?
       AND a.status = 'pending'
       GROUP BY substr(av.value_text, 1, 10)
       ORDER BY day ASC`
    )
    .all(visitTimeField.id, start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD") + "T23:59:59");

  for (const row of pendingRows) {
    if (!byDay[row.day]) {
      byDay[row.day] = { totalCount: 0, approvedCount: 0, pendingCount: 0, companies: [] };
    }
    byDay[row.day].pendingCount = row.count;
  }

  res.json({ success: true, month, byDay });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return error(res, "文件超过 5MB 限制");
  }
  return error(res, err.message || "服务异常", 500);
});

app.listen(PORT, () => {
  const siteRoot = BASE_PATH || "/";
  console.log(`visit demo running at http://localhost:${PORT}${siteRoot}`);
});
