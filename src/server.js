import "dotenv/config";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, createRepo } from "./db.js";
import { createAutoExcel } from "./excel.js";
import { createRoutes } from "./routes.js";
import { createSheetsSync } from "./sheets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DB_FILE = abs(process.env.DB_FILE || "data/scans.db");
const AUTO_EXCEL = String(process.env.AUTO_EXCEL ?? "true") === "true";
const AUTO_EXCEL_FILE = abs(process.env.AUTO_EXCEL_FILE || "data/scans.xlsx");
const API_KEY = process.env.API_KEY || "";

const db = openDb(DB_FILE);
const repo = createRepo(db);
const autoExcel = AUTO_EXCEL ? createAutoExcel(repo, AUTO_EXCEL_FILE) : null;
autoExcel?.touch();

// Google Sheets (opsional): aktif jika GOOGLE_SCRIPT_URL diisi di .env
const sheets = createSheetsSync({
  repo,
  url: (process.env.GOOGLE_SCRIPT_URL || "").trim(),
  token: process.env.GOOGLE_SCRIPT_TOKEN || "",
  sheetUrl: (process.env.GOOGLE_SHEET_URL || "").trim(),
});
sheets.touch(); // sinkron sekali saat server menyala

// Dipanggil setiap data berubah (scan, edit, hapus, ubah stok minimum)
const onChange = () => {
  autoExcel?.touch();
  sheets.touch();
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// Library scanner disajikan dari node_modules, jadi aplikasi jalan tanpa CDN / tanpa internet.
app.use("/vendor/html5-qrcode", express.static(path.join(root, "node_modules/html5-qrcode")));
app.use("/vendor/jsqr", express.static(path.join(root, "node_modules/jsqr/dist")));
app.use(express.static(path.join(root, "public")));

if (API_KEY) {
  app.use("/api", (req, res, next) => {
    if (req.path === "/health") return next();
    if (req.get("x-api-key") === API_KEY) return next();
    res.status(401).json({ error: "API key salah atau tidak ada" });
  });
}

app.use(
  "/api",
  createRoutes({
    repo,
    onChange,
    sync: sheets,
    allowNegative: String(process.env.ALLOW_NEGATIVE_STOCK ?? "false") === "true",
    info: { database: "SQLite", autoExcel: AUTO_EXCEL, secure: false, needsKey: Boolean(API_KEY) },
  })
);

app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint tidak ditemukan" }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan di server" });
});

const { SSL_KEY, SSL_CERT } = process.env;
const useHttps = Boolean(SSL_KEY && SSL_CERT);
const server = useHttps
  ? https.createServer({ key: fs.readFileSync(abs(SSL_KEY)), cert: fs.readFileSync(abs(SSL_CERT)) }, app)
  : http.createServer(app);

server.listen(PORT, HOST, () => {
  const scheme = useHttps ? "https" : "http";
  console.log("\n  QR to Excel berjalan");
  console.log(`  Komputer ini : ${scheme}://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) console.log(`  Jaringan LAN : ${scheme}://${n.address}:${PORT}`);
    }
  }
  console.log(`  Database     : ${DB_FILE}`);
  if (AUTO_EXCEL) console.log(`  Auto Excel   : ${AUTO_EXCEL_FILE}`);
  console.log(`  Google Sheets: ${sheets.enabled ? "aktif (sinkron otomatis setiap ada perubahan)" : "nonaktif (isi GOOGLE_SCRIPT_URL di .env untuk mengaktifkan)"}`);
  if (!useHttps) console.log("  Catatan      : kamera di HP butuh HTTPS (lihat README bagian 'Akses dari HP').\n");
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
