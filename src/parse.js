// Memisahkan isi QR menjadi KODE dan NAMA BARANG.
//
// Contoh yang dikenali:
//   "A-01 Batu Baterai ABC Alkaline AA isi 6 (u/ Jam dll) 6pcs/pax"   (dipisah spasi pertama)
//   "A-01 | Batu Baterai ABC ..."     "A-01; Batu ..."     "A-01\tBatu ..."     "A-01\nBatu ..."
//   "A-01 - Batu Baterai ABC ..."     "A-01, Batu ..."     "A-01: Batu ..."
//   "A-01"                            (hanya kode, nama kosong)
//
// Jika format QR Anda berbeda, atur QR_SEPARATOR di file .env (mis. QR_SEPARATOR=#).

const CODE_CHARS = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function parseScan(raw, customSep = process.env.QR_SEPARATOR) {
  const text = String(raw ?? "").trim();
  if (!text) return { code: "", name: "" };

  // 1) Pemisah eksplisit: pemisah dari .env, lalu baris baru, tab, "|", ";"
  const custom = customSep ? customSep.replace(/\\t/g, "\t").replace(/\\n/g, "\n") : "";
  for (const sep of [custom, "\n", "\t", "|", ";"].filter(Boolean)) {
    const i = text.indexOf(sep);
    if (i > 0) return { code: clean(text.slice(0, i)), name: clean(text.slice(i + sep.length)) };
  }

  // 2) KODE diikuti ",", ":" atau " - "
  let m = text.match(/^([A-Za-z0-9][A-Za-z0-9._/-]*)\s*(?:[,:]|\s[-–—]\s)\s*([\s\S]+)$/);
  if (m) return { code: m[1], name: clean(m[2]) };

  // 3) KODE diikuti spasi: kata pertama dianggap kode jika mengandung angka (A-01, BR001, 8999…)
  m = text.match(/^(\S+)\s+([\s\S]+)$/);
  if (m && CODE_CHARS.test(m[1]) && /\d/.test(m[1])) return { code: m[1], name: clean(m[2]) };

  // 4) Satu kata saja → dianggap kode
  if (!/\s/.test(text)) return { code: clean(text), name: "" };

  // 5) Kalimat tanpa kode di depan → semuanya nama
  return { code: "", name: clean(text) };
}
