## Folder `data/`

### Database bersama (`ops-sis.db`)

File `ops-sis.db` di-commit ke Git agar data demo (personil, titik kerawanan, dll.) sama di setiap laptop setelah `git pull`.

**Setelah pull / clone** (teman Anda):

1. Hapus sisa WAL lama jika ada:
   ```powershell
   Remove-Item data/ops-sis.db-wal, data/ops-sis.db-shm -ErrorAction SilentlyContinue
   ```
2. Jalankan aplikasi seperti biasa (`npm run dev`). `DATABASE_URL` default: `file:./data/ops-sis.db`.

**Sebelum push** (mengunggah perubahan data dari laptop Anda):

1. Hentikan `npm run dev` jika sedang berjalan (opsional, lebih aman).
2. Ekspor snapshot terbaru:
   ```bash
   npm run db:export
   ```
3. Commit & push `data/ops-sis.db`.

### Database baru dari seed

Jika ingin data awal dari skrip (bukan dari Git):

```bash
npm run db:seed
npm run db:seed:kupang
```
