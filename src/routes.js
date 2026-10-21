import { Router } from "express";
import { buildWorkbook } from "./excel.js";
import { parseScan } from "./parse.js";

const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const MAX_QTY = 100000;
const validQty = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_QTY;
const effect = (type, qty) => (type === "OUT" ? -qty : qty);
const sameCode = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function createRoutes({ repo, onChange, sync, info, allowNegative = false }) {
  const r = Router();

  r.get("/health", (_req, res) => res.json({ ok: true, ...info }));

  r.get("/stats", (_req, res) => res.json(repo.stats()));

  // ---------- Riwayat transaksi ----------
  r.get("/scans", (req, res) => {
    const q = clip(req.query.q, 200);
    res.json({ items: repo.list(q, 500) });
  });

  r.post("/scans", (req, res) => {
    const content = clip(req.body?.content, 4001);
    const note = clip(req.body?.note, 500);
    const source = clip(req.body?.source || "kamera", 20);
    const type = req.body?.type === "OUT" ? "OUT" : "IN";
    const qty = req.body?.qty === undefined ? 1 : Number(req.body.qty);
    const allowDuplicate = req.body?.allowDuplicate === true;

    if (!content) return res.status(400).json({ error: "Isi QR kosong" });
    if (content.length > 4000) return res.status(400).json({ error: "Isi QR terlalu panjang (maks 4000 karakter)" });
    if (!validQty(qty)) return res.status(400).json({ error: `Jumlah harus bilangan bulat 1–${MAX_QTY}` });

    const { code, name } = parseScan(content);
    if (!code) {
      return res.status(400).json({
        error: "Kode barang tidak terbaca dari QR ini, sehingga stok tidak bisa dihitung (contoh isi QR: \"A-01 Nama Barang\")",
      });
    }

    if (!allowDuplicate) {
      const existing = repo.findDuplicate(code, content);
      if (existing) return res.status(409).json({ error: `Kode ${code} sudah pernah di-scan`, existing });
    }

    // Barang keluar tidak boleh melebihi stok (kecuali ALLOW_NEGATIVE_STOCK=true)
    if (type === "OUT" && !allowNegative) {
      const cur = repo.stockOf(code);
      if (qty > cur) {
        const msg = cur <= 0 ? `Stok ${code} kosong (0)` : `Stok ${code} tidak cukup (sisa ${cur}, diminta ${qty})`;
        return res.status(422).json({ error: msg, stock: cur });
      }
    }

    const item = repo.insert({ code, name, content, note, source, type, qty });
    onChange?.();
    res.status(201).json({ item, stock: repo.stockOf(code) });
  });

  // Ubah kode, nama barang, jumlah, dan/atau catatan (kirim field yang ingin diubah saja)
  r.patch("/scans/:id", (req, res) => {
    const id = Number(req.params.id);
    const cur = repo.get(id);
    if (!cur) return res.status(404).json({ error: "Data tidak ditemukan" });
    const has = (k) => Object.prototype.hasOwnProperty.call(req.body ?? {}, k);

    const next = {
      code: has("code") ? clip(req.body.code, 100) : cur.code,
      name: has("name") ? clip(req.body.name, 500) : cur.name,
      note: has("note") ? clip(req.body.note, 500) : cur.note,
      qty: has("qty") ? Number(req.body.qty) : cur.qty,
    };
    if (!validQty(next.qty)) return res.status(400).json({ error: `Jumlah harus bilangan bulat 1–${MAX_QTY}` });
    if (!next.code) return res.status(400).json({ error: "Kode tidak boleh kosong" });

    // Jangan sampai perubahan membuat stok menjadi minus
    if (!allowNegative && (next.qty !== cur.qty || !sameCode(next.code, cur.code))) {
      const base = repo.stockOf(next.code) - (sameCode(next.code, cur.code) ? effect(cur.type, cur.qty) : 0);
      const after = base + effect(cur.type, next.qty);
      if (after < 0) return res.status(422).json({ error: `Perubahan ini membuat stok ${next.code} menjadi ${after} (minus)` });
      if (!sameCode(next.code, cur.code)) {
        // stok kode lama juga harus tetap tidak minus
        const oldAfter = repo.stockOf(cur.code) - effect(cur.type, cur.qty);
        if (oldAfter < 0) return res.status(422).json({ error: `Perubahan ini membuat stok ${cur.code} menjadi ${oldAfter} (minus)` });
      }
    }

    const item = repo.update(id, next);
    onChange?.();
    res.json({ item, stock: repo.stockOf(item.code) });
  });

  r.delete("/scans/:id", (req, res) => {
    if (!repo.remove(Number(req.params.id))) return res.status(404).json({ error: "Data tidak ditemukan" });
    onChange?.();
    res.json({ ok: true });
  });

  r.delete("/scans", (req, res) => {
    if (req.query.confirm !== "yes") return res.status(400).json({ error: "Tambahkan ?confirm=yes untuk menghapus semua data" });
    const deleted = repo.clear();
    onChange?.();
    res.json({ ok: true, deleted });
  });

  // ---------- Stok per barang ----------
  r.get("/stock", (req, res) => {
    res.json({ items: repo.stock(clip(req.query.q, 200)) });
  });

  r.patch("/stock/:code", (req, res) => {
    const code = clip(req.params.code, 100);
    const min = Number(req.body?.minStock);
    if (!code) return res.status(400).json({ error: "Kode kosong" });
    if (!Number.isInteger(min) || min < 0 || min > MAX_QTY) {
      return res.status(400).json({ error: `Stok minimum harus bilangan bulat 0–${MAX_QTY}` });
    }
    repo.setMinStock(code, min);
    onChange?.();
    res.json({ ok: true, code, minStock: min });
  });

  // ---------- Google Sheets ----------
  r.get("/sync", (_req, res) => res.json(sync ? sync.status() : { enabled: false }));

  r.post("/sync", async (_req, res, next) => {
    try {
      if (!sync?.enabled) return res.status(400).json({ error: "Google Sheets belum diatur (isi GOOGLE_SCRIPT_URL di .env)" });
      res.json(await sync.syncNow());
    } catch (err) {
      next(err);
    }
  });

  // ---------- Excel ----------
  r.get("/export.xlsx", async (_req, res, next) => {
    try {
      const wb = buildWorkbook(repo.all(), repo.stock());
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      const name = `data-qr-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  });

  return r;
}
