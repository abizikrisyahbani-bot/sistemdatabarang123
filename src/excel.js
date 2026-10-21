import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const TZ = process.env.TIMEZONE || "Asia/Jakarta";

export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: TZ, dateStyle: "medium", timeStyle: "medium" }) : "";

export const STATUS_LABEL = { ok: "Aman", low: "Menipis", out: "Habis" };

function styleHeader(ws) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { vertical: "middle" };
  head.height = 22;
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });
}

export function buildWorkbook(rows, stock = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QR to Excel";
  wb.created = new Date();

  // ---------- Sheet 1: Stok per barang ----------
  const ss = wb.addWorksheet("Stok", { views: [{ state: "frozen", ySplit: 1 }] });
  ss.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Kode", key: "kode", width: 16, style: { numFmt: "@" } }, // teks, agar angka panjang tidak jadi 1.23E+12
    { header: "Nama Barang", key: "nama", width: 60 },
    { header: "Masuk", key: "masuk", width: 10 },
    { header: "Keluar", key: "keluar", width: 10 },
    { header: "Stok", key: "stok", width: 10 },
    { header: "Stok Minimum", key: "min", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Transaksi Terakhir", key: "terakhir", width: 24 },
  ];
  styleHeader(ss);
  stock.forEach((s, i) => {
    const n = i + 2;
    const row = ss.addRow({
      no: i + 1,
      kode: String(s.code),
      nama: s.name,
      masuk: s.inQty,
      keluar: s.outQty,
      stok: { formula: `D${n}-E${n}`, result: s.stock }, // otomatis menghitung ulang jika Anda mengedit Masuk/Keluar
      min: s.minStock,
      status: STATUS_LABEL[s.status],
      terakhir: fmtTime(s.lastAt),
    });
    row.getCell("stok").font = { bold: true };
    if (s.status === "out") row.getCell("status").font = { bold: true, color: { argb: "FFDC2626" } };
    if (s.status === "low") row.getCell("status").font = { bold: true, color: { argb: "FFD97706" } };
  });
  ss.autoFilter = { from: "A1", to: "I1" };

  // ---------- Sheet 2: Riwayat transaksi ----------
  const ws = wb.addWorksheet("Riwayat", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Waktu", key: "waktu", width: 24 },
    { header: "Jenis", key: "jenis", width: 10 },
    { header: "Kode", key: "kode", width: 16, style: { numFmt: "@" } },
    { header: "Nama Barang", key: "nama", width: 60 },
    { header: "Jumlah", key: "qty", width: 10 },
    { header: "Catatan", key: "catatan", width: 32 },
    { header: "Sumber", key: "sumber", width: 12 },
    { header: "Isi QR (asli)", key: "isi", width: 60, style: { numFmt: "@" } },
  ];
  styleHeader(ws);
  rows.forEach((r, i) => {
    const row = ws.addRow({
      no: i + 1,
      waktu: fmtTime(r.createdAt),
      jenis: r.type === "OUT" ? "Keluar" : "Masuk",
      kode: String(r.code),
      nama: r.name,
      qty: r.qty,
      catatan: r.note,
      sumber: r.source,
      isi: String(r.content),
    });
    row.getCell("jenis").font = { bold: true, color: { argb: r.type === "OUT" ? "FFEA580C" : "FF059669" } };
  });
  ws.autoFilter = { from: "A1", to: "I1" };

  return wb;
}

// Perbarui file Excel otomatis setiap ada perubahan (ditunda 800 ms agar tidak menulis berulang-ulang).
export function createAutoExcel(repo, file) {
  let timer = null;
  const run = async () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await buildWorkbook(repo.all(), repo.stock()).xlsx.writeFile(file);
    } catch (err) {
      // Biasanya karena file sedang terbuka di Excel (Windows mengunci file). Akan dicoba lagi pada scan berikutnya.
      console.warn(`[auto-excel] gagal menulis ${file}: ${err.code || err.message}. Tutup file Excel jika sedang terbuka.`);
    }
  };
  return {
    touch() {
      clearTimeout(timer);
      timer = setTimeout(run, 800);
    },
    now: run,
  };
}
