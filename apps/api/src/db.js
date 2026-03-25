import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DB_PATH } from "./constants.js";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      options_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temp_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temp_id TEXT NOT NULL UNIQUE,
      field_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'pending',
      reject_reason_code TEXT,
      reject_reason_text TEXT,
      decision_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS application_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value_text TEXT,
      value_number REAL,
      value_select TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES applications(id)
    );

    CREATE TABLE IF NOT EXISTS application_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES applications(id)
    );
  `);

  migrateApplicationsTable();

  seedDefaults();
  ensureCompanyField();
  ensureVisitTimeField();

  const uploadRuntimeDir = path.resolve("uploads/runtime");
  if (!fs.existsSync(uploadRuntimeDir)) {
    fs.mkdirSync(uploadRuntimeDir, { recursive: true });
  }
}

function migrateApplicationsTable() {
  const cols = db.prepare("PRAGMA table_info(applications)").all().map((c) => c.name);
  const add = (name, sql) => {
    if (!cols.includes(name)) {
      db.exec(sql);
    }
  };
  add("status", "ALTER TABLE applications ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  add("reject_reason_code", "ALTER TABLE applications ADD COLUMN reject_reason_code TEXT");
  add("reject_reason_text", "ALTER TABLE applications ADD COLUMN reject_reason_text TEXT");
  add("decision_at", "ALTER TABLE applications ADD COLUMN decision_at TEXT");
}

function seedDefaults() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM form_fields WHERE active = 1").get().c;
  if (count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO form_fields (field_key, label, type, required, options_json, sort_order, created_at, updated_at)
    VALUES (@field_key, @label, @type, @required, @options_json, @sort_order, @created_at, @updated_at)
  `);

  const tx = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  tx([
    {
      field_key: "visitor_name",
      label: "访客姓名",
      type: "text",
      required: 1,
      options_json: null,
      sort_order: 1,
      created_at: now,
      updated_at: now
    },
    {
      field_key: "visit_time",
      label: "来访时间",
      type: "text",
      required: 1,
      options_json: null,
      sort_order: 2,
      created_at: now,
      updated_at: now
    },
    {
      field_key: "company_name",
      label: "来访单位名称",
      type: "text",
      required: 1,
      options_json: null,
      sort_order: 3,
      created_at: now,
      updated_at: now
    },
    {
      field_key: "visitor_count",
      label: "来访人数",
      type: "number",
      required: 1,
      options_json: null,
      sort_order: 4,
      created_at: now,
      updated_at: now
    },
    {
      field_key: "visit_purpose",
      label: "来访目的",
      type: "select",
      required: 1,
      options_json: JSON.stringify(["会议", "面试", "送货"]),
      sort_order: 5,
      created_at: now,
      updated_at: now
    },
    {
      field_key: "attachment",
      label: "附件",
      type: "file",
      required: 0,
      options_json: null,
      sort_order: 6,
      created_at: now,
      updated_at: now
    }
  ]);
}

function ensureCompanyField() {
  const existing = db
    .prepare("SELECT id, active FROM form_fields WHERE field_key = 'company_name' OR label LIKE '%单位%' OR label LIKE '%公司%' ORDER BY id ASC LIMIT 1")
    .get();
  if (existing) {
    if (!existing.active) {
      db.prepare("UPDATE form_fields SET active = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), existing.id);
    }
    return;
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM form_fields WHERE active = 1").get().max_order;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO form_fields (field_key, label, type, required, options_json, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run("company_name", "来访单位名称", "text", 1, null, Number(maxOrder || 0) + 1, now, now);
}

function ensureVisitTimeField() {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id, active, required, type FROM form_fields WHERE field_key = 'visit_time' ORDER BY id ASC LIMIT 1")
    .get();

  if (existing) {
    db.prepare(
      "UPDATE form_fields SET active = 1, required = 1, type = 'text', label = '来访时间', updated_at = ? WHERE id = ?"
    ).run(now, existing.id);
    return;
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM form_fields WHERE active = 1").get().max_order;
  db.prepare(
    `INSERT INTO form_fields (field_key, label, type, required, options_json, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run("visit_time", "来访时间", "text", 1, null, Number(maxOrder || 0) + 1, now, now);
}

export default db;
