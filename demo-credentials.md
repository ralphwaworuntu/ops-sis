# Demo Credentials — OPS SIS

> **PERINGATAN:** File ini berisi kredensial demo untuk pengembangan.
> **JANGAN gunakan di lingkungan produksi.**

## Akun Demo

| Username            | Password    | Peran    | Unit                     | Akses Utama                              |
| ------------------- | ----------- | -------- | ------------------------ | ---------------------------------------- |
| `karoops_admin`     | `karoops123`| **KARO OPS** | POLDA Metro Jaya     | Approval final Rengiat, monitoring semua |
| `polda_admin`       | `polda123`  | **POLDA**| POLDA Metro Jaya         | Review Rengiat, AI Generator, monitoring |
| `polres_jaksel`     | `polres123` | **POLRES**| POLRES Jakarta Selatan  | Input peta rawan, buat Rengiat, AI Audit |
| `polres_jaktim`     | `polres123` | **POLRES**| POLRES Jakarta Timur   | Input peta rawan, buat Rengiat, AI Audit |
| `polsek_kebayoran`  | `polsek123` | **POLSEK**| POLSEK Kebayoran Baru  | Lapor kegiatan + unggah foto             |
| `polsek_pancoran`   | `polsek123` | **POLSEK**| POLSEK Pancoran        | Lapor kegiatan + unggah foto             |

## Alur Testing

1. Login sebagai `polres_jaksel` → Buat Rengiat → Ajukan untuk Review
2. Login sebagai `polda_admin` → Review Rengiat → Jalankan AI Auditor → Teruskan ke KARO OPS
3. Login sebagai `karoops_admin` → ACC (Setujui) Rengiat
4. Login sebagai `polsek_kebayoran` → Buat Laporan Kegiatan untuk Rengiat yang disetujui

## Akses dari laptop lain (LAN)

- Jalankan **`npm run dev`** di mesin yang punya kode. Di terminal harus muncul baris **Network** dengan alamat `http://192.168.x.x:5173/` — **pakai IP persis itu** (bukan tebak `.49` atau `.50`).
- Cek IP Wi‑Fi di Mac: Terminal → `ipconfig getifaddr en0` (Wi‑Fi). Kalau kosong, coba `en1`.
- **Safari “can’t connect to the server”** = tidak ada proses yang mendengarkan di IP:port itu: pastikan dev server jalan, sudah **restart** setelah ubah config, dan URL memakai **`http://`** (bukan `https://`).
- **Firewall macOS:** System Settings → Network → Firewall → Options → izinkan **node** / **Cursor** / **Terminal** untuk koneksi masuk, atau matikan firewall sementara untuk uji.
- Buka **URL yang sama** di semua perangkat (jangan campur `localhost` di satu tab dan IP di tab lain untuk skenario yang sama).
- Jika login dari laptop lain masih gagal, di DevTools → **Network** cek respons POST `/login`: status **403** + *Cross-site* = host/origin; status **401** = kredensial atau DB belum di-seed di mesin server.

## Seed Database

```bash
npm run db:seed
```
