// Sinkronisasi ke Google Sheets lewat Google Apps Script (tanpa kredensial Google Cloud).
//
// Cara kerja: setiap ada perubahan data, server mengirim "snapshot" lengkap (sheet Stok + Riwayat)
// ke Web App Apps Script, yang menimpa isi dua sheet tersebut. Database SQLite tetap sumber data utama.
// Pengiriman ditunda ±1 detik (digabung jika ada beberapa scan beruntun) dan diulang otomatis jika gagal.
import { fmtTime, STATUS_LABEL } from "./excel.js";

export function createSheetsSync({ repo, url, token, sheetUrl = "" }) {
  const enabled = Boolean(url);
  const state = { enabled, sheetUrl, syncing: false, pending: false, lastOkAt: null, lastError: null, failures: 0 };
  let timer = null;
  let running = false;
  let again = false;

  function buildPayload() {
    const stock = repo.stock("").map((s) => ({
      code: String(s.code),
      name: s.name,
      inQty: s.inQty,
      outQty: s.outQty,
      stock: s.stock,
      minStock: s.minStock,
      status: STATUS_LABEL[s.status],
      last: fmtTime(s.lastAt),
    }));
    const all = repo.all();
    const n = all.length;
    // Terbaru di atas, supaya scan terakhir langsung terlihat saat sheet dipantau
    const moves = all
      .slice()
      .reverse()
      .map((r, i) => ({
        no: n - i,
        time: fmtTime(r.createdAt),
        type: r.type === "OUT" ? "Keluar" : "Masuk",
        code: String(r.code),
        name: r.name,
        qty: r.qty,
        note: r.note,
        source: r.source,
        content: String(r.content),
      }));
    return { token, updatedAt: fmtTime(new Date().toISOString()), stock, moves };
  }

  async function post() {
    let res, text;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // text/plain: Apps Script tidak butuh preflight CORS
        body: JSON.stringify(buildPayload()),
        redirect: "follow", // Apps Script membalas lewat redirect 302
        signal: AbortSignal.timeout(90_000),
      });
      text = await res.text();
    } catch (e) {
      if (e?.name === "TimeoutError") throw new Error("Google tidak merespons (timeout)");
      throw new Error("Tidak bisa terhubung ke Google (cek koneksi internet)");
    }
    if (!res.ok) throw new Error(`Google membalas HTTP ${res.status}. Periksa URL Web App.`);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Respons bukan JSON. Pastikan URL berakhiran /exec dan akses Web App diatur ke “Siapa saja”.");
    }
    if (!json.ok) {
      if (/token/i.test(json.error || "")) {
        throw new Error("Token salah: samakan GOOGLE_SCRIPT_TOKEN di .env dengan TOKEN di Apps Script.");
      }
      throw new Error(json.error || "Apps Script mengembalikan error");
    }
  }

  async function run() {
    clearTimeout(timer);
    timer = null;
    if (running) {
      again = true;
      return;
    }
    running = true;
    again = false;
    state.syncing = true;
    state.pending = false;
    try {
      await post();
      state.lastOkAt = Date.now();
      state.lastError = null;
      state.failures = 0;
    } catch (e) {
      state.lastError = e.message;
      state.failures++;
      console.warn(`[google-sheets] gagal sinkron: ${e.message}`);
    } finally {
      running = false;
      state.syncing = false;
    }
    if (state.lastError || again) {
      state.pending = true;
      // Gagal: coba lagi setelah 5 dtk, lalu 10, 20, 40 … (maks 2 menit). Berhasil tapi ada perubahan baru: 1,2 dtk.
      const wait = state.lastError ? Math.min(120_000, 5_000 * 2 ** Math.min(state.failures - 1, 5)) : 1_200;
      timer = setTimeout(run, wait);
    }
  }

  return {
    enabled,
    // Dipanggil setiap data berubah
    touch() {
      if (!enabled) return;
      state.pending = true;
      if (running) {
        again = true;
        return;
      }
      if (state.failures > 0 && timer) return; // sedang menunggu giliran coba ulang
      clearTimeout(timer);
      timer = setTimeout(run, 1_200);
    },
    // Tombol "Sinkron Sekarang": langsung kirim dan tunggu hasilnya
    async syncNow() {
      if (!enabled) return { ...state };
      if (running) {
        again = true;
        return { ...state };
      }
      await run();
      return { ...state };
    },
    status: () => ({ ...state }),
  };
}
