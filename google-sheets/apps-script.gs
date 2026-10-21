/**
 * QR to Excel — penerima sinkronisasi untuk Google Sheets
 *
 * Cara pasang: buka Google Sheets Anda > Ekstensi > Apps Script, hapus kode bawaan,
 * tempel seluruh isi file ini, ganti TOKEN di bawah, lalu Terapkan sebagai Aplikasi Web.
 * Panduan lengkap ada di README.md bagian "Google Sheets".
 *
 * Aplikasi mengirim data lengkap setiap kali ada perubahan. Script ini menimpa dua sheet:
 *   - "Stok"    : ringkasan stok per barang
 *   - "Riwayat" : semua transaksi (terbaru di atas)
 * Jangan mengedit dua sheet itu secara manual, karena akan tertimpa pada sinkronisasi berikutnya.
 * Sheet lain di file yang sama (mis. rekap, grafik) tidak disentuh dan boleh Anda buat sendiri.
 */

// GANTI dengan kata sandi buatan Anda sendiri. Harus SAMA dengan GOOGLE_SCRIPT_TOKEN di file .env
const TOKEN = "GANTI-DENGAN-KATA-SANDI-RAHASIA";

const STOK_HEADERS = ["No", "Kode", "Nama Barang", "Masuk", "Keluar", "Stok", "Stok Minimum", "Status", "Transaksi Terakhir"];
const RIWAYAT_HEADERS = ["No", "Waktu", "Jenis", "Kode", "Nama Barang", "Jumlah", "Catatan", "Sumber", "Isi QR (asli)"];
const NOTE = "Sheet ini diisi otomatis oleh aplikasi QR to Excel. Jangan diedit di sini karena akan tertimpa pada sinkronisasi berikutnya.";

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return out_({ ok: false, error: "Script sedang sibuk, coba lagi" });
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.token !== TOKEN) return out_({ ok: false, error: "token salah" });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stock = d.stock || [];
    const moves = d.moves || [];
    writeStok_(ss, stock);
    writeRiwayat_(ss, moves);
    SpreadsheetApp.flush();
    return out_({ ok: true, stock: stock.length, moves: moves.length, at: d.updatedAt });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Buka URL Web App di browser untuk mengecek bahwa script berjalan
function doGet() {
  return out_({ ok: true, pesan: "QR to Excel (Google Sheets) aktif" });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Siapkan sheet: ambil/buat, kosongkan isi lama (format tetap), tulis judul kolom
function prepare_(ss, name, headers, widths) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#4f46e5");
  sh.setFrozenRows(1);
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange("A1").setNote(NOTE);
  return sh;
}

// Kolom teks diformat "@" SEBELUM diisi: kode angka panjang tidak berubah jadi 1.23E+12,
// tanggal tidak diubah otomatis, dan isi yang diawali "=" tidak dijalankan sebagai rumus.
function asText_(sh, n, cols) {
  cols.forEach(function (c) { sh.getRange(2, c, n, 1).setNumberFormat("@"); });
}

function writeStok_(ss, rows) {
  const sh = prepare_(ss, "Stok", STOK_HEADERS, [50, 110, 380, 70, 70, 70, 110, 90, 170]);
  const n = rows.length;
  if (!n) return;

  asText_(sh, n, [2, 3, 8, 9]);
  const values = rows.map(function (r, i) {
    return [i + 1, r.code, r.name, r.inQty, r.outQty, "", r.minStock, r.status, r.last];
  });
  sh.getRange(2, 1, n, 9).setValues(values);

  // Kolom Stok = Masuk - Keluar (rumus, jadi tetap benar jika dilihat/dihitung ulang di Sheets)
  const formulas = rows.map(function (r, i) { return ["=D" + (i + 2) + "-E" + (i + 2)]; });
  sh.getRange(2, 6, n, 1).setFormulas(formulas).setFontWeight("bold");

  const colors = rows.map(function (r) {
    return [r.status === "Habis" ? "#dc2626" : r.status === "Menipis" ? "#d97706" : "#059669"];
  });
  sh.getRange(2, 8, n, 1).setFontColors(colors).setFontWeight("bold");
}

function writeRiwayat_(ss, rows) {
  const sh = prepare_(ss, "Riwayat", RIWAYAT_HEADERS, [50, 170, 80, 110, 380, 70, 200, 80, 380]);
  const n = rows.length;
  if (!n) return;

  asText_(sh, n, [2, 3, 4, 5, 7, 8, 9]);
  const values = rows.map(function (r) {
    return [r.no, r.time, r.type, r.code, r.name, r.qty, r.note, r.source, r.content];
  });
  sh.getRange(2, 1, n, 9).setValues(values);

  const colors = rows.map(function (r) { return [r.type === "Keluar" ? "#ea580c" : "#059669"]; });
  sh.getRange(2, 3, n, 1).setFontColors(colors).setFontWeight("bold");
}
