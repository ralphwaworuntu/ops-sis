## Folder `data/` (lokal)

Folder ini dipakai untuk data runtime lokal (mis. database SQLite).

- **Tidak dipush ke GitHub**: file `*.db`, `*.db-wal`, `*.db-shm` dan data runtime lainnya.
- Untuk membuat database demo dari nol, gunakan:

```bash
npm run db:seed
```

