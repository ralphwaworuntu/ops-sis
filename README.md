# OPS — SIS

Aplikasi OPS SIS (SvelteKit) untuk Rengiat, LHP, Monitoring, Live Wall, dan fitur Field Giat/Heartbeat.

## Prasyarat

- **Node.js v24** (direkomendasikan via Volta agar otomatis per project)
- NPM

## Cara paling mudah (tanpa ribet switch versi Node): Volta

1. Install Volta (sekali saja) dari dokumentasi resmi Volta.
2. Clone repo ini, lalu masuk ke foldernya:

```bash
cd "OPS - SIS"
node -v
```

Jika Volta aktif, `node -v` akan otomatis mengikuti versi yang dipin di `package.json` (Node 24).

## Menjalankan aplikasi (dev)

```bash
npm install
npm run db:seed
npm run dev
```

- Dev server listen di `0.0.0.0:5173` (bisa diakses dari perangkat lain via IP LAN).

## Catatan penting: `data/` dan `uploads/`

- Folder `data/` dan `uploads/` **tidak menyertakan DB/media** di GitHub untuk mencegah kebocoran data.
- Untuk membuat DB demo baru di mesin yang baru clone, jalankan **`npm run db:seed`**.

