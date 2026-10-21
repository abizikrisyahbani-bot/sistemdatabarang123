const $ = (id) => document.getElementById(id);
const PREF = "qr2excel.prefs", KEYSTORE = "qr2excel.apikey";
const DEFAULTS = { dedupe: false, sound: true, mode: "IN" };
const STATUS = { ok: "Aman", low: "Menipis", out: "Habis" };

let prefs = { ...DEFAULTS };
try { prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF)) }; } catch {}
const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch {} };

let moves = [], stock = [], tab = "stock";
let scanner = null, cameras = [], camIdx = 0, running = false;
let lastCode = "", lastAt = 0, toastTimer;

// ---------- util ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" });

function toast(msg, type = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 3000);
}

function beep(ok = true) {
  if (prefs.sound) {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = ok ? 880 : 220;
      o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.15, a.currentTime);
      o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.25));
    } catch {}
  }
  if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 40, 80]);
}

// ---------- API ----------
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const key = localStorage.getItem(KEYSTORE);
  if (key) headers["x-api-key"] = key;

  const res = await fetch("/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}

  if (res.status === 401) {
    const k = prompt("Server meminta API key. Masukkan API key:");
    if (k) { localStorage.setItem(KEYSTORE, k); return api(path, { method, body }); }
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- data ----------
async function refresh(quiet = false) {
  try {
    const q = encodeURIComponent($("search").value.trim());
    const [m, s, st] = await Promise.all([api("/scans?q=" + q), api("/stock?q=" + q), api("/stats")]);
    moves = m.items;
    stock = s.items;
    $("sItems").textContent = st.items;
    $("sUnits").textContent = st.units;
    $("sLow").textContent = st.low;
    $("sToday").textContent = st.today;
    render();
  } catch (e) {
    if (!quiet) toast("Server tidak terjangkau", "err");
  }
}

function render() {
  $("tbStock").innerHTML = stock.map((r) => `
    <tr>
      <td><b>${esc(r.code)}</b></td>
      <td class="content">${r.name ? esc(r.name) : '<span class="muted">—</span>'}</td>
      <td class="num">${r.inQty}</td>
      <td class="num">${r.outQty}</td>
      <td class="num stockval st-${r.status}">${r.stock}</td>
      <td class="num"><input type="number" class="f-min" min="0" max="100000" value="${r.minStock}" data-min="${esc(r.code)}" title="Batas stok minimum (0 = tidak dipantau)" aria-label="Stok minimum ${esc(r.code)}"></td>
      <td><span class="tag st-${r.status}">${STATUS[r.status]}</span></td>
    </tr>`).join("");
  $("emptyStock").hidden = stock.length > 0;

  $("tbMoves").innerHTML = moves.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td>${esc(fmt(r.createdAt))}</td>
      <td><span class="tag mv-${r.type === "OUT" ? "out" : "in"}">${r.type === "OUT" ? "− Keluar" : "+ Masuk"}</span></td>
      <td><input type="text" class="f-code" value="${esc(r.code)}" data-id="${r.id}" data-field="code" maxlength="100" title="Isi QR asli: ${esc(r.content)}"></td>
      <td><input type="text" class="f-name" value="${esc(r.name)}" data-id="${r.id}" data-field="name" maxlength="500" title="${esc(r.name)}"></td>
      <td class="num"><input type="number" class="f-qty" min="1" max="100000" value="${r.qty}" data-id="${r.id}" data-field="qty" aria-label="Jumlah"></td>
      <td><input type="text" value="${esc(r.note)}" data-id="${r.id}" data-field="note" placeholder="Tambah catatan" maxlength="500"></td>
      <td><button class="x" data-del="${r.id}" title="Hapus transaksi" aria-label="Hapus">✕</button></td>
    </tr>`).join("");
  $("emptyMoves").hidden = moves.length > 0;
}

// ---------- mode & jumlah ----------
function setMode(m) {
  prefs.mode = m === "OUT" ? "OUT" : "IN";
  savePrefs();
  document.body.dataset.mode = prefs.mode;
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === prefs.mode));
  $("modeHint").innerHTML = prefs.mode === "IN"
    ? "Setiap scan <b>MENAMBAH</b> stok."
    : "Setiap scan <b>MENGURANGI</b> stok.";
}

function getQty() {
  let n = parseInt($("qty").value, 10);
  if (!Number.isFinite(n) || n < 1) n = 1;
  if (n > 100000) n = 100000;
  $("qty").value = n;
  return n;
}

document.querySelectorAll("#modeSeg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("qMinus").onclick = () => { $("qty").value = Math.max(1, getQty() - 1); };
$("qPlus").onclick = () => { $("qty").value = getQty() + 1; };
$("qty").addEventListener("change", getQty);

// ---------- tab ----------
function setTab(t) {
  tab = t;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  $("paneStock").hidden = t !== "stock";
  $("paneMoves").hidden = t !== "moves";
  $("btnClear").hidden = t !== "moves";
}
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

// ---------- tambah transaksi ----------
async function addRecord(content, source = "kamera") {
  content = String(content || "").trim();
  if (!content) return false;
  const qty = getQty();
  const type = prefs.mode;
  try {
    const res = await api("/scans", { method: "POST", body: { content, source, type, qty, allowDuplicate: !prefs.dedupe } });
    const it = res.item;
    const sign = type === "OUT" ? "−" : "+";
    $("lastCode").textContent = `${it.code}  ${sign}${qty}`;
    $("lastName").textContent = it.name || "";
    $("lastStock").textContent = `Stok sekarang: ${res.stock}`;
    beep(true);
    toast(`${it.code} ${sign}${qty} → stok ${res.stock}`, "good");
    refresh();
    return true;
  } catch (e) {
    beep(false);
    toast(e.message, "err");
    return false;
  }
}

// ---------- tabel: edit & hapus ----------
$("tbMoves").addEventListener("click", async (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  try { await api("/scans/" + id, { method: "DELETE" }); refresh(); } catch (err) { toast(err.message, "err"); }
});

$("tbMoves").addEventListener("change", async (e) => {
  const { id, field } = e.target.dataset;
  if (!id || !field) return;
  try {
    await api("/scans/" + id, { method: "PATCH", body: { [field]: e.target.value } });
    toast("Perubahan disimpan", "good");
    refresh(); // stok ikut dihitung ulang
  } catch (err) {
    toast(err.message, "err");
    refresh(); // kembalikan tampilan ke nilai yang tersimpan
  }
});

$("tbStock").addEventListener("change", async (e) => {
  const code = e.target.dataset.min;
  if (code === undefined) return;
  try {
    await api("/stock/" + encodeURIComponent(code), { method: "PATCH", body: { minStock: Number(e.target.value) } });
    toast("Stok minimum disimpan", "good");
    refresh();
  } catch (err) { toast(err.message, "err"); refresh(); }
});

let st;
$("search").addEventListener("input", () => { clearTimeout(st); st = setTimeout(refresh, 250); });

$("btnClear").onclick = async () => {
  if (!moves.length) return;
  if (!confirm("Hapus SEMUA riwayat transaksi?\nStok semua barang akan kembali ke 0. Tindakan ini tidak bisa dibatalkan.")) return;
  try { await api("/scans?confirm=yes", { method: "DELETE" }); refresh(); toast("Semua riwayat dihapus"); }
  catch (err) { toast(err.message, "err"); }
};

// ---------- unduh Excel (membawa API key bila ada) ----------
async function exportExcel() {
  try {
    const headers = {};
    const key = localStorage.getItem(KEYSTORE);
    if (key) headers["x-api-key"] = key;
    const res = await fetch("/api/export.xlsx", { headers });
    if (res.status === 401) {
      const k = prompt("Server meminta API key. Masukkan API key:");
      if (k) { localStorage.setItem(KEYSTORE, k); return exportExcel(); }
      return;
    }
    if (!res.ok) throw new Error("Gagal mengunduh Excel");
    const blob = await res.blob();
    const m = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : "data-qr.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("File Excel diunduh", "good");
  } catch (err) { toast(err.message, "err"); }
}
$("btnExport").onclick = exportExcel;

// ---------- scanner kamera ----------
function onScan(text) {
  const now = Date.now();
  if (text === lastCode && now - lastAt < 2500) return; // cegah scan ganda beruntun
  lastCode = text; lastAt = now;
  addRecord(text, "kamera");
}

async function startScan() {
  if (typeof Html5Qrcode === "undefined") return toast("Library scanner gagal dimuat", "err");
  try {
    if (!scanner) scanner = new Html5Qrcode("reader");
    if (!cameras.length) cameras = await Html5Qrcode.getCameras();
    // Tanpa qrbox: seluruh frame dipindai sehingga QR kecil/jauh tetap terbaca
    const cfg = { fps: 15, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
    const first = cameras.length && camIdx > 0 ? cameras[camIdx % cameras.length].id : { facingMode: "environment" };
    try {
      await scanner.start(first, cfg, onScan, () => {});
    } catch (e1) {
      if (!cameras.length) throw e1;
      await scanner.start(cameras[camIdx % cameras.length].id, cfg, onScan, () => {});
    }
    running = true;
    $("btnStart").disabled = true; $("btnStop").disabled = false; $("btnSwitch").disabled = cameras.length < 2;
    toast("Arahkan QR ke kamera, jarak ±15–25 cm");
  } catch (err) {
    const m = String(err && (err.message || err));
    toast(
      /Permission|NotAllowed/i.test(m) ? "Akses kamera ditolak. Izinkan kamera di pengaturan browser." :
      /NotFound|Requested device/i.test(m) ? "Kamera tidak ditemukan." :
      /secure|https/i.test(m) ? "Kamera butuh HTTPS atau localhost." :
      "Kamera gagal dibuka: " + m.slice(0, 80),
      "err"
    );
  }
}

async function stopScan() {
  if (scanner && running) { try { await scanner.stop(); scanner.clear(); } catch {} }
  running = false;
  $("btnStart").disabled = false; $("btnStop").disabled = true; $("btnSwitch").disabled = true;
  $("reader").innerHTML = "Kamera nonaktif.<br>Tekan “Mulai Scan”.";
}

$("btnStart").onclick = startScan;
$("btnStop").onclick = stopScan;
$("btnSwitch").onclick = async () => { camIdx = (camIdx + 1) % Math.max(cameras.length, 1); await stopScan(); startScan(); };

// ---------- scan dari gambar ----------
function loadImg(file) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
}

async function decodeImageFile(file) {
  const img = await loadImg(file);
  const W = img.naturalWidth, H = img.naturalHeight;
  if (typeof jsQR !== "undefined") {
    for (const maxSide of [1400, 900, 600, 400, 250]) {
      const k = Math.min(1, maxSide / Math.max(W, H));
      const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
      if (code && code.data) return code.data;
    }
  }
  try { return await new Html5Qrcode("readerFile").scanFile(file, false); } catch { return ""; }
}

$("fileIn").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await decodeImageFile(f);
    if (text) addRecord(text, "gambar");
    else toast("QR tidak terbaca. Coba gambar yang lebih jelas / dipotong pas di QR.", "err");
  } catch { toast("Gambar tidak bisa dibuka", "err"); }
  e.target.value = "";
};

// ---------- input manual / scanner USB ----------
const doManual = async () => { if (await addRecord($("manualIn").value, "manual")) $("manualIn").value = ""; };
$("btnManual").onclick = doManual;
$("manualIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doManual(); } });

// ---------- opsi ----------
$("optDedupe").checked = prefs.dedupe;
$("optSound").checked = prefs.sound;
$("optDedupe").onchange = (e) => { prefs.dedupe = e.target.checked; savePrefs(); };
$("optSound").onchange = (e) => { prefs.sound = e.target.checked; savePrefs(); };

// ---------- Google Sheets ----------
async function pollSync() {
  try {
    const s = await api("/sync");
    $("syncBar").hidden = !s.enabled;
    if (!s.enabled) return;

    const dot = $("syncDot"), text = $("syncText");
    if (s.lastError) {
      dot.className = "dot off";
      text.textContent = `Google Sheets gagal: ${s.lastError} (dicoba lagi otomatis)`;
    } else if (s.syncing || s.pending) {
      dot.className = "dot";
      text.textContent = "Google Sheets: menyinkronkan…";
    } else if (s.lastOkAt) {
      dot.className = "dot on";
      text.textContent = "Google Sheets: tersinkron " + new Date(s.lastOkAt).toLocaleTimeString("id-ID");
    } else {
      dot.className = "dot";
      text.textContent = "Google Sheets: menunggu sinkron pertama…";
    }
    $("syncLink").hidden = !s.sheetUrl;
    if (s.sheetUrl) $("syncLink").href = s.sheetUrl;
  } catch {}
}

$("btnSync").onclick = async () => {
  const btn = $("btnSync");
  btn.disabled = true;
  $("syncText").textContent = "Google Sheets: menyinkronkan…";
  try {
    const s = await api("/sync", { method: "POST" });
    if (s.lastError) toast(s.lastError, "err"); else toast("Google Sheets tersinkron", "good");
  } catch (e) { toast(e.message, "err"); }
  btn.disabled = false;
  pollSync();
};

setInterval(pollSync, 4000);

// Muat ulang data berkala, supaya scan dari HP muncul di komputer lain tanpa me-refresh halaman.
// Dilewati saat Anda sedang mengetik di tabel agar isian tidak hilang.
setInterval(() => {
  if (document.hidden) return;
  const a = document.activeElement;
  if (a && a.tagName === "INPUT" && a.closest("table")) return;
  refresh(true);
}, 8000);

// ---------- mulai ----------
setMode(prefs.mode);
setTab("stock");
refresh();
pollSync();
