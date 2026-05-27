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

## Catatan penting (Node 24 + better-sqlite3)

Project ini memakai SQLite lokal via `better-sqlite3` (native addon).

- Jika kamu pernah `npm install` pakai Node 22 lalu menjalankan/build pakai Node 24, kamu bisa kena error:
  - `better_sqlite3.node was compiled against NODE_MODULE_VERSION 127, requires 137`
- Solusinya: **pastikan install + build + run memakai Node yang sama**.

### Opsi A (disarankan untuk produksi): Tetap Node 24, rebuild native addon

#### Windows (Build Tools diperlukan)

1. Install **Visual Studio 2022 Build Tools** + workload **Desktop development with C++**
   - Komponen yang perlu: MSVC v143, Windows 10/11 SDK, C++ CMake tools (opsional tapi membantu).
2. Pastikan Node 24 aktif:

```bash
node -v
```

3. Bersihkan dan install ulang dependencies agar `better-sqlite3` ter-compile untuk Node 24:

```bash
rm -rf node_modules package-lock.json
npm install
```

4. Jika masih gagal, paksa rebuild dari source:

```bash
npm rebuild better-sqlite3 --build-from-source
```

#### Linux (butuh toolchain build)

Install toolchain, lalu install ulang:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 make g++
rm -rf node_modules package-lock.json
npm install
```

Jika perlu:

```bash
npm rebuild better-sqlite3 --build-from-source
```

### Opsi B (cepat untuk development): Pin Node 22 untuk install + run

Jika kamu belum butuh Node 24 dan ingin menghindari build tools native (terutama di Windows),
jalankan semua perintah lewat Volta Node 22 agar konsisten:

```bash
volta run --node 22.22.0 --npm 11.0.0 npm install
volta run --node 22.22.0 --npm 11.0.0 npm run db:seed
volta run --node 22.22.0 --npm 11.0.0 npm run dev
```

Catatan: repo masih mem-pin Node 24 di `package.json`. Untuk benar-benar “resmi” pin ke Node 22,
ubah `package.json` (`engines` + `volta`) setelah tim sepakat.

### Opsi C: Migrasi storage (mengurangi risiko native addon)

Jika target deployment kamu tidak cocok untuk native addon (mis. serverless tertentu),
pertimbangkan:

- **Pindah ke MySQL** (README `.env.example` sudah menyebut target prod MySQL), atau
- **libsql/Turso** (SQLite remote), atau
- Driver SQLite lain yang tidak butuh native build di target.

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

## Dokumentasi

| Dokumen | Isi |
| ------- | --- |
| [docs/PROJECT-DOCUMENTATION.md](docs/PROJECT-DOCUMENTATION.md) | Arsitektur, ERD, DFD, RBAC, API — untuk developer |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Panduan deploy VPS super lengkap |
| [docs/README.md](docs/README.md) | Indeks dokumentasi |

## Deploy ke VPS (production)

Stack: **Node.js** + **adapter-node** (bukan XAMPP). Database: **SQLite** di `data/`.

### Instalasi otomatis (Ubuntu 22.04 / 24.04)

```bash
chmod +x deploy/install.sh
sudo DOMAIN=sis.example.com EMAIL=admin@example.com \
     bash deploy/install.sh --yes
```

Opsi: `--from-local` (rsync dari repo ini), `--skip-seed`, `--skip-ssl`. Detail lengkap: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

### Deploy manual singkat

```bash
npm ci && cp .env.production.example .env.production
# edit ORIGIN / VITE_APP_URL (HTTPS)
npm run db:seed   # pertama kali
set -a && source .env.production && set +a && npm run build
npm start   # atau: pm2 start deploy/ecosystem.config.cjs
```

Nginx: `deploy/nginx-ops-sis.conf.example` · PM2: `deploy/ecosystem.config.cjs`

