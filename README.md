# QR to Excel

Aplikasi web untuk memindai QR code, menyimpannya ke **database SQLite**, dan mengekspornya ke **Excel (.xlsx)** secara otomatis.

- Scan lewat kamera, dari gambar/screenshot, atau alat scanner USB
- Data tersimpan permanen di database (`data/scans.db`)
- File Excel `data/scans.xlsx` **diperbarui otomatis** setiap ada scan baru
- Tombol **Unduh Excel** untuk mengambil file terbaru kapan saja
- Anti-duplikat, pencarian, catatan per data, statistik harian

## 1. Persiapan

1. Pasang **Node.js 22.13 atau lebih baru** (Node 24 juga bisa) dari <https://nodejs.org> (pilih versi LTS). Cek di terminal: `node -v`
2. Pasang **Visual Studio Code** dari <https://code.visualstudio.com>

## 2. Menjalankan di VS Code

1. Ekstrak zip, lalu di VS Code pilih **File → Open Folder…** dan buka folder `qr-to-excel`.
2. Klik **Install** pada notifikasi "rekomendasi ekstensi" (SQLite Viewer, Prettier, Rainbow CSV). Ini opsional.
3. Buka terminal: menu **Terminal → New Terminal**.
4. Jalankan:
   ```bash
   npm install
   ```
5. (Opsional) Salin `.env.example` menjadi `.env` bila ingin mengubah pengaturan.
6. Jalankan server, pilih salah satu:
   - ketik `npm start` di terminal, atau
   - tekan **F5** (konfigurasi sudah disediakan di `.vscode/launch.json`)
7. Buka <http://localhost:3000> di browser. Kamera berfungsi di `localhost`.

Saat jalan, terminal menampilkan alamat, lokasi database, dan lokasi file Excel otomatis.

Mode pengembangan (server restart sendiri saat kode diubah): `npm run dev`

## 2b. Kode dan Nama Barang dipisah otomatis

Isi QR dipecah menjadi **Kode** dan **Nama Barang**, disimpan di kolom terpisah (database, tabel, dan Excel). Contoh:

| Isi QR | Kode | Nama Barang |
|---|---|---|
| `A-01 Batu Baterai ABC Alkaline AA isi 6 (u/ Jam dll) 6pcs/pax` | A-01 | Batu Baterai ABC Alkaline AA isi 6 (u/ Jam dll) 6pcs/pax |
| `A-01 \| Batu Baterai …` atau `A-01;Batu …` | A-01 | Batu Baterai … |
| `A-01 - Batu Baterai …`, `A-01, Batu …`, `A-01: Batu …` | A-01 | Batu Baterai … |
| baris pertama kode, baris kedua nama | A-01 | Batu Baterai … |
| `A-01` (hanya kode) | A-01 | (kosong) |

Aturan deteksi, berurutan: pemisah dari `QR_SEPARATOR` di `.env` → baris baru / tab / `|` / `;` → `,` `:` atau ` - ` setelah kode → spasi pertama (kata pertama dianggap kode bila mengandung angka).

Jika format QR Anda memakai pemisah lain, isi `QR_SEPARATOR` di `.env` (mis. `QR_SEPARATOR=#`).

- **Kode dan Nama bisa diedit langsung di tabel** (klik kolomnya, ubah, lalu klik di luar kolom), jika ada yang salah terbaca.
- **Anti-duplikat memakai Kode**: kode yang sama (A-01 = a-01) ditolak. Jika tidak ada kode, dicek dari isi QR.
- Kolom **Isi QR (asli)** tetap disimpan di database dan di Excel kolom terakhir.
- Database dari versi sebelumnya otomatis dimigrasi saat server dijalankan: data lama dipecah menjadi kode dan nama.

## 2c. Fitur Stok

Setiap scan adalah **transaksi**: barang **masuk (+)** atau **keluar (−)**. Stok = total masuk − total keluar, dihitung per **Kode** (A-01 = a-01).

**Cara memakai**
1. Di panel Scanner, pilih **Barang Masuk (+)** atau **Barang Keluar (−)**. Warna bingkai kamera berubah (hijau = masuk, oranye = keluar) agar tidak salah mode.
2. Atur **Jumlah per scan** (tombol − / + atau ketik). Contoh: satu dus isi 12 → isi 12, lalu scan sekali.
3. Scan QR (kamera, gambar, scanner USB, atau ketik manual). Stok langsung berubah, dan "Scan terakhir" menampilkan stok terbaru.
4. Tab **Stok** menampilkan semua barang: Masuk, Keluar, Stok, batas **Min** (bisa diedit), dan status.
5. Tab **Riwayat** menampilkan semua transaksi. Kode, nama, jumlah, dan catatan bisa diedit; transaksi bisa dihapus.

**Aturan**
- **Stok minimum**: isi angka di kolom *Min*. Stok ≤ Min berstatus **Menipis**, stok 0 berstatus **Habis**. Min = 0 berarti tidak dipantau.
- **Barang keluar ditolak** jika melebihi stok (mis. sisa 6, diminta 9). Ubah dengan `ALLOW_NEGATIVE_STOCK=true` di `.env` jika stok boleh minus.
- **QR harus punya kode** (mis. `A-01 Nama Barang`). QR tanpa kode ditolak karena stoknya tidak bisa dihitung.
- Mengedit jumlah di Riwayat yang membuat stok minus juga ditolak.
- **Hapus Semua Riwayat** mengembalikan semua stok ke 0.
- Data dari versi lama otomatis dianggap **barang masuk, jumlah 1 per baris**. Jika itu hanya data uji, hapus lewat tab Riwayat.

**Excel**: file berisi dua sheet. **Stok** (ringkasan per barang; kolom Stok memakai rumus `Masuk − Keluar`) dan **Riwayat** (semua transaksi dengan kolom Jenis dan Jumlah).

## 2d. Google Sheets (update langsung)

Setiap scan, edit, hapus, atau perubahan stok minimum otomatis dikirim ke Google Sheets sekitar **1 detik** kemudian. Dua sheet diisi: **Stok** (ringkasan per barang) dan **Riwayat** (semua transaksi, terbaru di atas). Database SQLite di komputer tetap menjadi sumber data utama, dan Google Sheets adalah salinan yang selalu diperbarui. Cocok untuk dipantau dari HP atau dibagikan ke tim (mode "Hanya lihat").

> **Jangan mengedit sheet Stok dan Riwayat langsung di Google Sheets.** Isinya ditimpa pada sinkronisasi berikutnya. Edit lewat aplikasi. Anda boleh menambah sheet lain (rekap, grafik) di file yang sama, karena tidak disentuh.

### Langkah pemasangan (sekitar 5 menit, gratis)

**A. Siapkan Google Sheets dan Apps Script**
1. Buka <https://sheets.google.com>, buat **spreadsheet kosong**, beri nama misalnya `Stok Gudang`.
2. Klik **Ekstensi → Apps Script**.
3. Hapus kode bawaan, lalu tempel seluruh isi file **`google-sheets/apps-script.gs`**.
4. Ganti baris ini dengan kata sandi buatan Anda sendiri (contoh: `toko-sinar-2026-x9K`):
   ```js
   const TOKEN = "GANTI-DENGAN-KATA-SANDI-RAHASIA";
   ```
5. Klik ikon **Simpan**.

**B. Deploy sebagai Aplikasi Web**
1. Klik **Terapkan → Penerapan baru**. Klik roda gigi di samping "Pilih jenis", lalu pilih **Aplikasi web**.
2. Isi **Jalankan sebagai: Saya** dan **Siapa yang memiliki akses: Siapa saja**.
3. Klik **Terapkan**, lalu **Beri akses** dan pilih akun Anda. Jika muncul "Google belum memverifikasi aplikasi ini", klik **Lanjutan → Buka … (tidak aman)**. Ini normal karena script buatan Anda sendiri.
4. Salin **URL aplikasi web** (berakhiran `/exec`).

**C. Hubungkan di aplikasi**
1. Buka file `.env` (salin dari `.env.example` jika belum ada), lalu isi:
   ```
   GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   GOOGLE_SCRIPT_TOKEN=toko-sinar-2026-x9K
   GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/XXXXXXXX/edit
   ```
   `GOOGLE_SCRIPT_TOKEN` harus **sama persis** dengan `TOKEN` di Apps Script. `GOOGLE_SHEET_URL` (link spreadsheet) opsional, untuk tombol "Buka Google Sheets".
2. Hentikan server (**Ctrl+C**), lalu jalankan lagi dengan `npm start`. Terminal menampilkan `Google Sheets: aktif`.
3. Buka aplikasi. Di atas tabel muncul baris status: **Google Sheets: tersinkron 14.01.10**. Dalam beberapa detik sheet **Stok** dan **Riwayat** terisi di spreadsheet Anda.

Setelah itu setiap scan langsung terlihat di Google Sheets. Tombol **Sinkron Sekarang** memaksa kirim ulang kapan saja.

### Jika gagal
Baris status berubah merah dan menampilkan penyebabnya. Aplikasi tetap bekerja normal (data tersimpan di komputer) dan mencoba kirim ulang otomatis: setelah 5, 10, 20 detik dan seterusnya (maksimal 2 menit).

| Pesan | Penyebab dan solusi |
|---|---|
| Token salah | `GOOGLE_SCRIPT_TOKEN` di `.env` berbeda dengan `TOKEN` di Apps Script. Samakan, lalu restart server. |
| Respons bukan JSON | URL salah (harus berakhiran `/exec`), atau akses Web App belum **Siapa saja**. Terapkan ulang (langkah B). |
| Google membalas HTTP 4xx/5xx | URL salah atau penerapan dihapus. Buat penerapan baru dan salin URL-nya. |
| Tidak bisa terhubung ke Google | Komputer sedang offline. Data aman dan akan terkirim saat online kembali. |

- Jika Anda **mengubah kode** Apps Script, terapkan ulang lewat **Terapkan → Kelola penerapan → ✏ → Versi baru → Terapkan**. URL tetap sama.
- Setiap kali data berubah, **seluruh** sheet dikirim ulang. Untuk puluhan ribu transaksi pengiriman bisa memakan beberapa detik, dan itu wajar. Satu kali kirim 2.000 transaksi sekitar 360 KB.
- Kuota Apps Script gratis jauh di atas pemakaian normal. Banyak scan beruntun digabung menjadi satu kali kirim.
- Token hanya pagar sederhana. Jangan menyebarkan URL Web App atau isi `.env` ke orang lain.

## 3. Struktur proyek

```
qr-to-excel/
├── src/
│   ├── server.js     # titik masuk: Express, file statis, HTTP/HTTPS
│   ├── routes.js     # endpoint REST API
│   ├── parse.js      # memisahkan isi QR menjadi kode + nama barang
│   ├── sheets.js     # sinkronisasi otomatis ke Google Sheets (antrian + coba ulang)
│   ├── db.js         # SATU-SATUNYA file yang menyentuh database
│   └── excel.js      # pembuat file Excel + auto-update
├── public/           # tampilan (dibuka di browser)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js     # scanner kamera, gambar, tabel, panggilan API
├── data/             # dibuat otomatis: scans.db dan scans.xlsx
├── google-sheets/
│   └── apps-script.gs  # kode untuk ditempel di Google Apps Script
├── .vscode/          # F5 untuk run, rekomendasi ekstensi
├── .env.example
└── package.json
```

## 4. Database

Memakai **SQLite**: tanpa instalasi server database, semua tersimpan di satu file `data/scans.db`.

Tabel `scans`:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INTEGER, PK | nomor urut otomatis |
| `code` | TEXT | kode barang, mis. `A-01` |
| `name` | TEXT | nama barang |
| `content` | TEXT | isi QR asli (utuh) |
| `type` | TEXT | `IN` (barang masuk) atau `OUT` (barang keluar) |
| `qty` | INTEGER | jumlah pada transaksi ini |
| `note` | TEXT | catatan |
| `source` | TEXT | `kamera`, `gambar`, atau `manual` |
| `created_at` | TEXT | waktu (UTC, ISO 8601) |

**Melihat isi database di VS Code:** pasang ekstensi **SQLite Viewer**, lalu klik file `data/scans.db` di panel Explorer.

**Backup:** cukup salin file `data/scans.db` (hentikan server dulu agar aman).

**Mengubah lokasi database:** isi `DB_FILE=` di `.env`, misalnya `DB_FILE=D:/data-toko/scans.db`.

### Pindah ke database lain (MySQL / PostgreSQL)

Semua akses database ada di `src/db.js` dan dipakai lewat fungsi `repo` (`list`, `insert`, `setNote`, `remove`, `clear`, `stats`, `all`, `findByContent`, `get`). Untuk pindah:

1. Pasang driver, mis. PostgreSQL: `npm install pg`
2. Tulis ulang `src/db.js` dengan fungsi yang sama namanya. Karena `pg` bersifat asinkron, tambahkan `async` di fungsi `repo` dan `await` di `src/routes.js` serta `src/excel.js`.
3. Simpan alamat koneksi di `.env`, misalnya `DATABASE_URL=postgres://user:pass@host:5432/qrdb`, lalu baca dengan `process.env.DATABASE_URL`.

Jika ingin saya buatkan versi PostgreSQL/MySQL lengkap, tinggal minta.

## 5. Excel

- **Otomatis:** file `data/scans.xlsx` ditulis ulang ±1 detik setelah setiap scan, catatan, atau penghapusan. Ubah di `.env`: `AUTO_EXCEL=false` untuk mematikan, atau `AUTO_EXCEL_FILE=` untuk lokasi lain (mis. folder OneDrive agar tersinkron ke Excel di HP).
- **Manual:** tombol **Unduh Excel** di aplikasi (atau buka <http://localhost:3000/api/export.xlsx>).
- **Windows mengunci file yang sedang terbuka di Excel.** Jika `scans.xlsx` terbuka, update otomatis dilewati dan terminal menampilkan peringatan. Tutup filenya, atau pakai tombol Unduh Excel.
- Kolom "Isi QR" disimpan sebagai teks, sehingga barcode angka panjang tidak berubah menjadi `1.23E+12`.

## 6. Akses dari HP (penting: kamera butuh HTTPS)

Browser hanya mengizinkan kamera di **`localhost` atau HTTPS**. Membuka `http://192.168.x.x:3000` dari HP **tidak akan bisa memakai kamera**. Dua cara:

### A. HTTPS lokal dengan mkcert (jaringan Wi-Fi yang sama)

1. Pasang mkcert (<https://github.com/FiloSottile/mkcert>), lalu di terminal:
   ```bash
   mkcert -install
   mkdir certs
   mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 192.168.1.10
   ```
   Ganti `192.168.1.10` dengan alamat LAN komputer Anda (ditampilkan server saat start).
2. Di `.env` aktifkan:
   ```
   SSL_KEY=certs/key.pem
   SSL_CERT=certs/cert.pem
   ```
3. Jalankan ulang, lalu buka `https://192.168.1.10:3000` di HP. HP perlu mempercayai sertifikat mkcert (salin file `rootCA.pem`, lokasinya lewat `mkcert -CAROOT`, lalu pasang di HP), atau tekan "lanjutkan" pada peringatan browser.

### B. Tunnel HTTPS instan (paling mudah)

Saat server berjalan, di terminal lain:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
Anda mendapat alamat `https://….trycloudflare.com` yang bisa dibuka dari HP mana pun. **Aktifkan `API_KEY` di `.env` (lihat bagian 8) sebelum memakai cara ini**, karena alamat itu terbuka untuk siapa saja yang tahu.

### C. Deploy ke server / hosting

Jalankan `npm start` di VPS atau layanan seperti Railway/Render, dan letakkan di belakang HTTPS (Nginx atau Caddy). Pastikan folder `data/` ada di penyimpanan permanen.

## 7. REST API

Semua di bawah `/api`:

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | status server |
| GET | `/stats` | `{ total, today }` |
| GET | `/scans?q=kata` | daftar data (maks 500, terbaru dulu) |
| POST | `/scans` | tambah transaksi. Body: `{ "content": "A-01 Nama", "type": "IN", "qty": 10, "source": "kamera", "allowDuplicate": true }`. `type` = `IN`/`OUT`. Duplikat → `409`, stok kurang → `422`, tanpa kode → `400` |
| GET | `/stock?q=kata` | stok per barang: `code, name, inQty, outQty, stock, minStock, status` |
| PATCH | `/stock/:code` | atur stok minimum. Body: `{ "minStock": 5 }` |
| GET | `/sync` | status Google Sheets: `enabled, syncing, lastOkAt, lastError` |
| POST | `/sync` | kirim ke Google Sheets sekarang |
| PATCH | `/scans/:id` | ubah data. Body (isi yang perlu saja): `{ "code": "...", "name": "...", "qty": 5, "note": "..." }` |
| DELETE | `/scans/:id` | hapus satu data |
| DELETE | `/scans?confirm=yes` | hapus semua data |
| GET | `/export.xlsx` | unduh Excel |

Contoh:
```bash
curl -X POST http://localhost:3000/api/scans -H "Content-Type: application/json" -d '{"content":"ABC-123"}'
```

## 8. Pengaturan (`.env`)

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | 3000 | port server |
| `HOST` | 0.0.0.0 | `127.0.0.1` jika hanya untuk komputer ini |
| `DB_FILE` | data/scans.db | lokasi database |
| `TIMEZONE` | Asia/Jakarta | zona waktu kolom Waktu di Excel |
| `AUTO_EXCEL` | true | update Excel otomatis |
| `AUTO_EXCEL_FILE` | data/scans.xlsx | lokasi Excel otomatis |
| `ALLOW_NEGATIVE_STOCK` | false | `true` = barang keluar boleh melebihi stok |
| `GOOGLE_SCRIPT_URL` | kosong | URL Web App Apps Script. Jika diisi, sinkron ke Google Sheets aktif |
| `GOOGLE_SCRIPT_TOKEN` | kosong | kata sandi, harus sama dengan `TOKEN` di Apps Script |
| `GOOGLE_SHEET_URL` | kosong | link spreadsheet, untuk tombol "Buka Google Sheets" |
| `API_KEY` | kosong | jika diisi, aplikasi meminta kunci ini sekali saat dibuka dan menyimpannya di browser |
| `SSL_KEY`, `SSL_CERT` | kosong | aktifkan HTTPS |

## 9. Pemecahan masalah

| Masalah | Solusi |
|---|---|
| `npm install` gagal / muncul `node-gyp` | Pakai versi proyek terbaru (database memakai SQLite bawaan Node, tanpa kompilasi). Hapus folder `node_modules` dan `package-lock.json` lama, lalu `npm install` ulang. |
| Muncul peringatan `ExperimentalWarning: SQLite` | Normal dan tidak berbahaya. Fitur SQLite bawaan Node masih berlabel eksperimental. |
| Kamera tidak muncul di HP | Harus HTTPS (bagian 6). Di laptop pakai `http://localhost:3000`. |
| Port sudah dipakai (`EADDRINUSE`) | Ubah `PORT=3001` di `.env`. |
| `scans.xlsx` tidak berubah | File sedang terbuka di Excel. Tutup, atau pakai tombol Unduh Excel. |
| QR tidak terbaca | Jarak ±15–25 cm, cahaya cukup, kecerahan layar HP dinaikkan. Untuk file, pakai gambar yang jelas. |
| Ingin mengosongkan semua | Tombol **Hapus Semua**, atau hentikan server lalu hapus folder `data/`. |

## 10. Keamanan

- Tanpa `API_KEY`, siapa pun yang bisa membuka alamat server dapat membaca dan menghapus data. Untuk jaringan terbuka atau internet, **wajib isi `API_KEY`** dan gunakan HTTPS.
- Jangan unggah `.env` atau `data/` ke GitHub (sudah ada di `.gitignore`).
