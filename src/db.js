// Satu-satunya file yang berbicara langsung dengan database.
// Untuk pindah ke MySQL/PostgreSQL, cukup ganti isi file ini (lihat README).
// Memakai SQLite bawaan Node.js (node:sqlite): tanpa library tambahan, tanpa kompilasi C++.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { parseScan } from "./parse.js";

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL DEFAULT '',
      name       TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      source     TEXT NOT NULL DEFAULT 'kamera',
      type       TEXT NOT NULL DEFAULT 'IN',   -- IN = barang masuk, OUT = barang keluar
      qty        INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS item_settings (
      code      TEXT PRIMARY KEY COLLATE NOCASE,
      min_stock INTEGER NOT NULL DEFAULT 0
    );
  `);
  migrate(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scans_content ON scans(content);
    CREATE INDEX IF NOT EXISTS idx_scans_code    ON scans(code COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at);
  `);
  return db;
}

// Database versi lama: tambahkan kolom yang belum ada, lalu isi code & name dari data yang sudah ada.
// Baris lama otomatis dianggap "barang masuk" jumlah 1.
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(scans)").all().map((c) => c.name);
  if (!cols.includes("code")) db.exec("ALTER TABLE scans ADD COLUMN code TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("name")) db.exec("ALTER TABLE scans ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("type")) db.exec("ALTER TABLE scans ADD COLUMN type TEXT NOT NULL DEFAULT 'IN'");
  if (!cols.includes("qty")) db.exec("ALTER TABLE scans ADD COLUMN qty INTEGER NOT NULL DEFAULT 1");

  const old = db.prepare("SELECT id, content FROM scans WHERE code = '' AND name = ''").all();
  if (!old.length) return;
  const upd = db.prepare("UPDATE scans SET code = ?, name = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const r of old) {
      const { code, name } = parseScan(r.content);
      upd.run(code, name, r.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function stockStatus(stock, minStock) {
  if (stock <= 0) return "out"; // habis
  if (minStock > 0 && stock <= minStock) return "low"; // menipis
  return "ok";
}

const COLS = "id, code, name, content, note, source, type, qty, created_at AS createdAt";
const SIGN = "CASE type WHEN 'IN' THEN qty WHEN 'OUT' THEN -qty ELSE 0 END";

export function createRepo(db) {
  const q = {
    list: db.prepare(`
      SELECT ${COLS} FROM scans
      WHERE (@q = '' OR code LIKE '%' || @q || '%' OR name LIKE '%' || @q || '%'
             OR content LIKE '%' || @q || '%' OR note LIKE '%' || @q || '%')
      ORDER BY id DESC LIMIT @limit`),
    all: db.prepare(`SELECT ${COLS} FROM scans ORDER BY id ASC`),
    // Duplikat: kode yang sama (tanpa peduli huruf besar/kecil); jika tidak ada kode, isi QR yang sama.
    dup: db.prepare(`
      SELECT ${COLS} FROM scans
      WHERE (@code <> '' AND code = @code COLLATE NOCASE) OR (@code = '' AND content = @content)
      LIMIT 1`),
    byId: db.prepare(`SELECT ${COLS} FROM scans WHERE id = ?`),
    insert: db.prepare(`
      INSERT INTO scans (code, name, content, note, source, type, qty)
      VALUES (@code, @name, @content, @note, @source, @type, @qty)`),
    update: db.prepare(`UPDATE scans SET code = @code, name = @name, note = @note, qty = @qty WHERE id = @id`),
    remove: db.prepare(`DELETE FROM scans WHERE id = ?`),
    clear: db.prepare(`DELETE FROM scans`),
    today: db.prepare(`SELECT COUNT(*) AS n FROM scans WHERE date(created_at,'localtime') = date('now','localtime')`),
    total: db.prepare(`SELECT COUNT(*) AS n FROM scans`),
    stockOf: db.prepare(`SELECT COALESCE(SUM(${SIGN}), 0) AS n FROM scans WHERE code = @code COLLATE NOCASE`),
    stock: db.prepare(`
      WITH agg AS (
        SELECT MIN(code) AS code,
               SUM(CASE WHEN type = 'IN'  THEN qty ELSE 0 END) AS inQty,
               SUM(CASE WHEN type = 'OUT' THEN qty ELSE 0 END) AS outQty,
               MAX(created_at) AS lastAt
        FROM scans WHERE code <> '' GROUP BY code COLLATE NOCASE
      ), joined AS (
        SELECT a.code, a.inQty, a.outQty, a.lastAt,
          COALESCE((SELECT s2.name FROM scans s2
                    WHERE s2.code = a.code COLLATE NOCASE AND s2.name <> ''
                    ORDER BY s2.id DESC LIMIT 1), '') AS name,
          COALESCE((SELECT m.min_stock FROM item_settings m WHERE m.code = a.code), 0) AS minStock
        FROM agg a
      )
      SELECT * FROM joined
      WHERE (@q = '' OR code LIKE '%' || @q || '%' OR name LIKE '%' || @q || '%')
      ORDER BY code COLLATE NOCASE`),
    setMin: db.prepare(`
      INSERT INTO item_settings (code, min_stock) VALUES (@code, @min)
      ON CONFLICT(code) DO UPDATE SET min_stock = excluded.min_stock`),
  };

  const stockList = (search = "") =>
    q.stock.all({ q: search }).map((r) => {
      const stock = r.inQty - r.outQty;
      return { ...r, stock, status: stockStatus(stock, r.minStock) };
    });

  return {
    list: (search = "", limit = 500) => q.list.all({ q: search, limit }),
    all: () => q.all.all(),
    findDuplicate: (code, content) => q.dup.get({ code, content }),
    get: (id) => q.byId.get(id),
    insert: ({ code = "", name = "", content, note = "", source = "kamera", type = "IN", qty = 1 }) => {
      const info = q.insert.run({ code, name, content, note, source, type, qty });
      return q.byId.get(info.lastInsertRowid);
    },
    update: (id, { code, name, note, qty }) =>
      q.update.run({ id, code, name, note, qty }).changes ? q.byId.get(id) : null,
    remove: (id) => q.remove.run(id).changes > 0,
    clear: () => q.clear.run().changes,

    stockOf: (code) => q.stockOf.get({ code }).n,
    stock: stockList,
    setMinStock: (code, min) => q.setMin.run({ code, min }),

    stats: () => {
      const items = stockList("");
      return {
        total: q.total.get().n, // jumlah transaksi
        today: q.today.get().n, // transaksi hari ini
        items: items.length, // jenis barang
        units: items.reduce((a, b) => a + b.stock, 0), // total unit di stok
        low: items.filter((i) => i.status !== "ok").length, // menipis + habis
      };
    },
  };
}
