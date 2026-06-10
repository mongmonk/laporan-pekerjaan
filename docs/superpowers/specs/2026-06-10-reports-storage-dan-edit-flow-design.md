# Desain: Penyimpanan Laporan (single-index) + Alur Tambah/Edit (Modal)

Tanggal: 2026-06-10
Status: Disetujui (menunggu review spec)

## Latar Belakang

Aplikasi "Laporan Harian" (React + Cloudflare Pages advanced-mode `_worker.js` + KV)
punya dua masalah yang akan ditangani bersama karena keduanya menyentuh fitur laporan:

1. **Penyimpanan tidak skalabel.** Tiap laporan disimpan sebagai key terpisah
   `report:<id>` di KV. `GET /api/reports` memanggil `list()` lalu melakukan satu
   `get()` per laporan (N+1 read). Konsekuensi: lambat & boros kuota saat data banyak,
   dan `list()` dibatasi 1000 key per panggilan (cursor belum ditangani) sehingga
   laporan ke-1001+ tidak akan muncul.

2. **Alur edit membingungkan.** Form tambah/edit berada di atas halaman. Klik "Edit"
   pada laporan paling bawah membuat form muncul jauh di atas — pengguna harus scroll
   dan kehilangan konteks.

## Tujuan

- Ubah model penyimpanan KV menjadi **satu index key** berisi seluruh laporan
  (Opsi B), menghapus masalah N+1 read dan limit 1000.
- Migrasikan 6 laporan lama secara **otomatis sekali jalan**, tanpa aksi manual.
- Ganti form tambah/edit menjadi **modal/popup** sehingga halaman tidak bergeser dan
  fokus penuh ke form.

## Non-Tujuan (YAGNI)

- Tidak menambah paginasi UI (daftar tetap dimuat & disortir di frontend).
- Tidak menambah locking/transaksi multi-user (app single-user).
- Tidak mengubah skema field laporan, endpoint URL, atau mekanisme auth.

---

## Bagian 1 — Penyimpanan: single index key

### Model data

Sebelum: N key `report:<id>`, masing-masing satu objek laporan.

Sesudah: **satu key** `reports:index` berisi array JSON seluruh laporan:

```json
[
  {
    "id": "report:1781083910210",
    "title": "...",
    "description": "...",
    "status": "pending | progress | done",
    "date": "YYYY-MM-DD",
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601 (opsional, saat diedit)"
  }
]
```

Format `id` tetap (`report:<timestamp>`), sehingga URL `PUT/DELETE /api/reports/:id`
dan kode frontend tidak berubah.

### Helper worker

Semua endpoint laporan melalui dua helper:

- `getIndex(env)` → kembalikan array laporan.
  1. Baca `reports:index`. Jika ada → parse & kembalikan.
  2. Jika **tidak ada** (first run / belum migrasi): jalankan migrasi (lihat bawah),
     tulis hasilnya ke `reports:index`, kembalikan array tersebut.
- `putIndex(env, arr)` → `env.REPORTS_KV.put('reports:index', JSON.stringify(arr))`.

### Perilaku endpoint (read-modify-write pada satu key)

| Endpoint | Perilaku baru |
|---|---|
| `GET /api/reports` | `arr = getIndex()` → `{ reports: arr }` (1 read KV) |
| `POST /api/reports` | `arr = getIndex()`; buat report baru (id = `report:`+Date.now()); `arr.push`; `putIndex`; balik report (201) |
| `PUT /api/reports/:id` | `arr = getIndex()`; cari index by id; jika tak ada → 404; ganti field; set `updated_at`; `putIndex`; balik report |
| `DELETE /api/reports/:id` | `arr = getIndex()`; filter buang by id; `putIndex`; balik `{success:true}` |

Auth & CORS tidak berubah.

### Migrasi otomatis (sekali jalan)

Di dalam `getIndex` saat `reports:index` belum ada:

1. `list({ prefix: 'report:' })` — ambil semua key laporan lama.
2. `get()` tiap key, parse, kumpulkan jadi array.
3. `put('reports:index', array)`.
4. **Hapus** tiap key `report:*` lama (`delete`) agar satu sumber data, tidak ada
   duplikat basi. *(Keputusan disetujui: hapus, bukan disimpan sebagai cadangan.)*
5. Kembalikan array.

Karena setelah langkah 3 key `reports:index` sudah ada, migrasi tidak pernah jalan lagi.

Catatan: `reports:index` belum tentu berisi data lama jika migrasi gagal di tengah.
Mitigasi sederhana: tulis index dulu (langkah 3) **sebelum** menghapus key lama
(langkah 4), sehingga jika gagal di tengah, data tetap aman di salah satu tempat.

### Konsekuensi konsistensi KV

KV bersifat eventually consistent: setelah tulis, pembacaan bisa tertinggal hingga
~beberapa detik. Karena kini hanya satu key, perilaku jadi lebih sederhana dan
konsisten dibanding `list()` sebelumnya. Last-write-wins diterima (single-user).

---

## Bagian 2 — Alur Tambah/Edit: Modal

### Perilaku

- Tombol **"+ Tambah Laporan"** dan tombol **"Edit"** pada kartu membuka **modal**
  (overlay di tengah, latar belakang meredup/scrim). Daftar di belakang tidak bergeser.
- Modal sama dipakai untuk dua mode:
  - **Tambah**: form kosong, judul modal "Tambah Laporan", tombol "Tambah Laporan".
  - **Edit**: form terisi data laporan, judul "Edit Laporan", tombol "Simpan Perubahan".
- Menutup modal: tombol **✕**, tombol **Batal**, klik **scrim**, atau tekan **Esc**.
- Submit sukses → modal tertutup → daftar di-reload.

### Susunan form (urut)

1. Tanggal (input date)
2. Judul Pekerjaan (input teks)
3. Deskripsi (textarea)
4. Status — **3 tombol pilih (segmented)**: ⏳ Pending / 🔄 In Progress / ✅ Done,
   menggantikan dropdown. Tombol aktif diberi warna sesuai status.
5. Aksi: **Simpan/Tambah** (primary) + **Batal** (ghost).

### Hapus

Tombol **Hapus** tetap di kartu daftar, dengan konfirmasi memakai `window.confirm`
yang sudah ada (tetap minimal; tidak membuat modal konfirmasi terpisah).

### Komponen frontend

- `ReportModal` (baru) — komponen presentasional berisi form, menerima props:
  `report` (null untuk mode tambah), `onSave`, `onClose`. Tidak menyimpan state global;
  state form lokal di dalamnya.
- `App` — ganti state `showForm` menjadi `modalOpen` + `editing`. Render `ReportModal`
  saat `modalOpen`. Logika `handleSave/handleDelete/loadReports` tetap.
- `ReportForm` lama dipindah/diadaptasi ke dalam `ReportModal` (atau diganti).
- Gaya modal & segmented mengikuti tema gelap existing; dibangun dengan kualitas
  frontend-design (spacing, hierarki, scrim, animasi buka/tutup halus).

### Aksesibilitas/UX minimal

- Fokus pindah ke field pertama saat modal terbuka.
- Esc & klik scrim menutup.
- Body di belakang tidak bisa di-scroll saat modal terbuka (opsional, nice-to-have).

---

## Testing / Verifikasi

Backend (via curl ke deployment atau lokal):
- Migrasi: setelah deploy, `GET /api/reports` mengembalikan 6 laporan lama; pastikan
  key `report:*` lama terhapus dan hanya `reports:index` tersisa (cek via wrangler /
  endpoint debug sementara bila perlu).
- CRUD: create → muncul di list; edit → field berubah & `updated_at` terisi; delete →
  hilang dari list.

Frontend (manual di app):
- Klik Edit di laporan paling bawah → modal terbuka di tengah, halaman tidak lompat.
- Tambah, edit, batal, Esc, klik scrim — semua menutup modal dengan benar.
- Segmented status memilih nilai yang benar dan tersimpan.

## Risiko & Mitigasi

- **Migrasi gagal sebagian** → tulis index sebelum hapus key lama (lihat Bagian 1).
- **Race read-modify-write** (dua tab) → diterima (last-write-wins), single-user.
- **Eventual consistency** → data baru mungkin tampil setelah jeda singkat; perilaku
  normal KV, sama seperti sekarang.
