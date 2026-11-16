# Backend SertiChain

API Express untuk dua hal: login dengan wallet (SIWE + JWT) dan data off-chain (profil pengguna di Supabase, upload PDF ke IPFS lewat Pinata). Penanggung jawab: Shamuel.

Backend tidak pernah mengirim transaksi dan tidak butuh private key. Semua transaksi (issue, update, revoke) dikirim frontend lewat MetaMask. Backend hanya membaca contract untuk mengecek role.

## Status

Semua endpoint di Roadmap sudah diimplementasikan.

| Bagian | File |
| --- | --- |
| Validasi `.env` saat start (server langsung berhenti kalau ada yang kurang) | `src/config.js` |
| Helmet, CORS hanya untuk frontend, batas body JSON 20 KB, rate limit di `/auth` | `src/app.js` |
| `requireAuth`: cek JWT dari header `Authorization: Bearer <token>`, tolak token yang sudah logout | `src/middleware/auth.js` |
| `requireRole("admin")` dan `requireRole("issuer")`: cek `hasRole` ke contract di setiap request | `src/middleware/auth.js` |
| Validasi body, params, dan query dengan zod, termasuk menolak field yang tidak dikenal | `src/schemas.js`, `src/middleware/validate.js` |
| Format error yang seragam, tanpa membocorkan stack trace | `src/middleware/error.js` |
| Pembuatan dan verifikasi JWT (`signSession`, `verifySession`) | `src/lib/session.js` |
| Skema database `users`, `auth_nonces`, `revoked_tokens`, RLS aktif | `db/schema.sql` |
| Login SIWE: `POST /auth/nonce`, `POST /auth/verify`, `POST /auth/logout` | `src/routes/auth.js` |
| Profil sendiri: `GET/POST/PUT/DELETE /users/me` | `src/routes/users.js` |
| Admin: `GET /admin/users`, `DELETE /admin/users/:id` | `src/routes/admin.js` |
| Profil publik: `GET /public/profiles/:wallet` | `src/routes/public.js` |
| Upload PDF ke Pinata: `POST /files` | `src/routes/files.js` |
| Script pembuat token untuk testing | `scripts/dev-token.js` |

## Menjalankan

Butuh Node.js 22.13 atau lebih baru.

### 1. Siapkan Supabase

1. Buat project baru di supabase.com.
2. Buka **SQL Editor**, tempel isi `db/schema.sql`, lalu klik **Run**. Kalau sebelumnya sudah pernah dijalankan, jalankan lagi: script aman dijalankan ulang dan akan menambah tabel `revoked_tokens`.
3. Buka **Project Settings > API**. Catat **Project URL** dan key **service_role**. Jangan pakai key `anon`.

### 2. Isi `.env`

```bash
cd backend
copy .env.example .env
```

(Di macOS atau Linux: `cp .env.example .env`.)

| Variabel | Isi |
| --- | --- |
| `JWT_SECRET` | Buat dengan `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SEPOLIA_RPC_URL` | URL Sepolia dari Infura (buat API key sendiri, gratis) |
| `CONTRACT_ADDRESS` | Sudah terisi alamat contract di Sepolia |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Dari langkah 1 |
| `PINATA_JWT` | Dari dashboard Pinata, menu API Keys. Dibutuhkan oleh `POST /files` |

File `.env` sudah masuk `.gitignore`. Jangan pernah di-commit, dan jangan kirim isinya lewat chat.

### 3. Jalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:4000/health`. Kalau muncul `{"status":"ok"}`, server sudah jalan. `npm run dev` otomatis restart setiap kali file disimpan.

### 4. Testing endpoint yang butuh login

Login asli lewat frontend memakai `/auth/nonce` lalu `/auth/verify`. Untuk testing cepat tanpa MetaMask, buat token langsung dari script:

```bash
npm run dev-token -- 0x821b1DA745835553c56a87BE2141744486b2056a
```

Lalu kirim request dengan header `Authorization: Bearer <token>`, misalnya lewat Postman, Insomnia, atau Thunder Client. Script ini memakai `JWT_SECRET` lokal, jadi hanya untuk testing di laptop sendiri.

Wallet yang bisa dipakai untuk testing role:

| Role | Wallet |
| --- | --- |
| Admin | `0x5eDebdC977AC66de68D2b7a7EC717382db98D002` |
| Issuer | `0x821b1DA745835553c56a87BE2141744486b2056a` |

## Struktur folder

```text
backend/
  db/schema.sql           tabel users, auth_nonces, revoked_tokens, jalankan di Supabase
  scripts/dev-token.js    buat JWT untuk testing
  src/
    server.js             titik start
    app.js                daftar middleware dan route
    config.js             baca dan validasi .env
    schemas.js            aturan validasi input (zod)
    lib/
      contract.js         baca role dari contract (isAdmin, isIssuer, isHolder)
      session.js          buat dan cek JWT
      supabase.js         client Supabase (service_role)
      http.js             HttpError dan notImplemented
    middleware/
      auth.js             requireAuth, requireRole
      validate.js         validateBody, validateParams, validateQuery
      error.js            404 dan error handler
    routes/
      auth.js  users.js  admin.js  public.js  files.js
```

## Cara kerja login dan role

1. Setelah login berhasil, backend membuat JWT dengan `sub` = wallet address (huruf kecil).
2. Setiap endpoint yang butuh login memakai `requireAuth`. Wallet pengguna tersedia di `req.user.wallet`.
3. Endpoint Admin dan Issuer memakai `requireRole`, yang memanggil `hasRole` ke contract di setiap request. Role tidak disimpan di database atau di JWT. Kalau Admin mencabut Issuer di contract, aksesnya langsung hilang.
4. Data yang diubah selalu dicari berdasarkan `req.user.wallet`, tidak pernah dari input pengguna. Ini yang mencegah IDOR (pengguna mengubah data orang lain).

## Endpoint

| Method | Path | Login | Role | Input | Respons sukses |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/auth/nonce` | - | - | `{ "address": "0x..." }` | `200 { "nonce": "..." }` |
| `POST` | `/auth/verify` | - | - | `{ "message": "...", "signature": "0x..." }` | `200 { "token": "..." }` |
| `POST` | `/auth/logout` | Ya | - | - | `204` |
| `GET` | `/users/me` | Ya | - | - | `200` profil |
| `POST` | `/users/me` | Ya | - | `full_name` (wajib), `student_id`, `email`, `avatar_url` (https) | `201` profil |
| `PUT` | `/users/me` | Ya | - | Field yang mau diubah, minimal satu | `200` profil |
| `DELETE` | `/users/me` | Ya | - | - | `204` |
| `GET` | `/admin/users?page=1&limit=20` | Ya | Admin | `limit` maksimal 100 | `200 { "data": [...], "page", "limit", "total" }` |
| `DELETE` | `/admin/users/:id` | Ya | Admin | `id` berupa UUID | `204` |
| `GET` | `/public/profiles/:wallet` | - | - | wallet address | `200 { "full_name": "..." }` |
| `POST` | `/files` | Ya | Issuer | `multipart/form-data`, field `file` (PDF, maksimal 5 MB) | `200 { "fileHash": "0x...", "cid": "..." }` |

Kode error yang perlu ditangani frontend: `400` input tidak valid, `401` belum login atau login gagal, `403` role tidak cukup, `404` data tidak ada, `409` profil sudah ada, `429` terlalu banyak request ke `/auth`, `502` upload ke Pinata gagal.

## Keputusan yang diambil

- **Logout memakai pilihan B.** Saat logout, `jti` token disimpan di tabel `revoked_tokens`, dan `requireAuth` menolak token yang `jti`-nya ada di sana. Baris yang sudah lewat `expires_at` dibersihkan otomatis saat ada yang logout. Perlu dikonfirmasi ke Satrio.
- **`/auth/verify` juga mengecek `uri`** di pesan SIWE harus sama dengan `FRONTEND_ORIGIN`, selain domain, chain ID, dan nonce.
- **Nonce lama ikut dibersihkan.** Setiap `POST /auth/nonce` menghapus nonce wallet tersebut yang sudah kedaluwarsa.
- **Nama file di IPFS memakai hash file**, bukan nama file asli dari pengirim, supaya nama atau NIM di nama file tidak ikut terpublikasi.
- **`GET /public/profiles/:wallet` membalas `404`** kalau wallet tersebut belum punya profil. Frontend bisa menampilkan alamat wallet sebagai gantinya.

## Roadmap

Semua langkah di bawah sudah dikerjakan. Bagian ini disimpan sebagai catatan desain.

### 1. `POST /auth/nonce` (F-01)

- Input: `{ "address": "0x..." }` (sudah divalidasi dan diubah ke huruf kecil).
- Buat nonce acak dengan `generateNonce()` dari library `siwe`.
- Simpan ke `auth_nonces`: `nonce`, `wallet_address`, `expires_at` = sekarang + 5 menit.
- Balas: `{ "nonce": "..." }`.

### 2. `POST /auth/verify` (F-01)

Input: `{ "message": "...", "signature": "0x..." }`. Urutannya:

1. Parse dengan `new SiweMessage(message)`.
2. Pastikan `chainId` sama dengan `config.CHAIN_ID`.
3. Cari nonce di `auth_nonces` yang cocok dengan `nonce` dan `address` di pesan, `used = false`, dan `expires_at` belum lewat.
4. Panggil `siweMessage.verify({ signature, domain: siweDomain, nonce })`. `siweDomain` diambil dari `src/config.js`.
5. Tandai nonce terpakai dengan satu query `update ... set used = true where nonce = ? and used = false`, lalu pastikan ada satu baris yang berubah. Kalau tidak ada, berarti nonce sudah dipakai request lain: tolak.
6. Balas `{ "token": signSession(address) }`.

Kalau langkah mana pun gagal, balas `401` dengan pesan umum ("Login gagal"), tanpa menyebut bagian mana yang salah.

### 3. `POST /auth/logout` (F-02)

JWT tidak bisa dibatalkan begitu saja. Ada dua pilihan:

- **A (sederhana):** balas `204`, frontend menghapus token, dan token kedaluwarsa sendiri sesuai `JWT_EXPIRES_IN`. Kelemahannya: token yang sempat dicuri tetap berlaku sampai kedaluwarsa.
- **B (disarankan, dipakai):** buat tabel `revoked_tokens (jti varchar primary key, expires_at timestamptz)`. Saat logout, simpan `req.user.jti`. Di `requireAuth`, tolak token yang `jti`-nya ada di tabel itu. `jti` sudah otomatis ada di setiap token.

### 4. Profil sendiri `/users/me` (F-11)

| Method | Perilaku |
| --- | --- |
| `POST` | Insert dengan `wallet_address: req.user.wallet`. Kalau profil sudah ada (error code `23505`), balas `409`. Sukses: `201` + profil |
| `GET` | Ambil profil sendiri. Belum ada: `404` |
| `PUT` | Update hanya field yang dikirim, `where wallet_address = req.user.wallet`. Profil tidak ada: `404` |
| `DELETE` | Hapus profil sendiri, balas `204` |

Pakai konstanta `PROFILE_COLUMNS` di `select`, jangan `select("*")`.

### 5. Admin (F-12)

- `GET /admin/users`: daftar semua profil, urut dari terbaru. Pagination `?page=1&limit=20`, batas `limit` maksimal 100, query divalidasi dengan zod.
- `DELETE /admin/users/:id`: validasi `id` dengan `z.uuid()`, hapus, `404` kalau tidak ada, `204` kalau berhasil.

### 6. `GET /public/profiles/:wallet` (F-09)

- Validasi `wallet` dengan `walletSchema`.
- Balas hanya `{ "full_name": "..." }`. Email dan NIM tidak boleh keluar dari endpoint ini, karena halaman verifikasi bisa dibuka siapa pun.

### 7. `POST /files` (mendukung F-05 dan F-10)

Request berupa `multipart/form-data` dengan field `file`.

1. Kalau `req.file` kosong (tidak ada file, atau mimetype bukan PDF), balas `400`.
2. Cek 5 byte pertama file adalah `%PDF-`. Mimetype bisa dipalsukan pengirim, isi file tidak.
3. Hitung hash: `"0x" + createHash("sha256").update(req.file.buffer).digest("hex")` dari `node:crypto`.
4. Upload ke Pinata (`POST https://uploads.pinata.cloud/v3/files`, `network=public`) dengan `PINATA_JWT`.
5. Balas `{ "fileHash": "0x...", "cid": "..." }`.

Isi PDF di IPFS bisa dibaca siapa pun yang tahu CID-nya, jadi sertifikat cukup berisi nama penerima dan detail kegiatan, tanpa NIM atau email.

### 8. Testing dan checklist keamanan

Sebelum pengumpulan tanggal 15 November, semua poin ini harus terpenuhi:

- [x] Nonce sekali pakai dan kedaluwarsa 5 menit
- [x] Pesan SIWE dicek domain, chain ID, dan nonce-nya
- [x] Semua query lewat Supabase client, tidak ada SQL yang disusun dari string input pengguna
- [x] Setiap endpoint yang mengubah data memakai `req.user.wallet`, bukan input pengguna
- [x] Endpoint publik hanya mengembalikan nama
- [x] Upload hanya PDF (cek header `%PDF-`) dengan batas ukuran
- [x] `.env` tidak pernah masuk commit (cek dengan `git status` sebelum commit)
- [x] Logout sudah diputuskan (pilihan B, tunggu konfirmasi Satrio)
- [x] Setiap endpoint dites untuk kasus berhasil dan kasus ditolak (tanpa token, token salah, role salah, input salah) dengan Supabase, Sepolia, dan Pinata asli

## Kesepakatan dengan frontend

Poin ini perlu disamakan dengan Rajen dan Edo:

| Hal | Kesepakatan |
| --- | --- |
| Alamat backend | `http://localhost:4000` |
| Header login | `Authorization: Bearer <token>`. Token disimpan di memori atau `sessionStorage`, bukan di URL |
| Format error | `{ "error": "..." }`, ditambah `formErrors` dan `fieldErrors` kalau input tidak valid |
| Pesan SIWE | `domain: window.location.host`, `uri: window.location.origin`, `version: "1"`, `chainId: 11155111`, `nonce` dari `/auth/nonce` |
| Hash file | SHA-256 dari byte PDF, format `0x` + 64 karakter hex. Di frontend: `ethers.sha256(new Uint8Array(await file.arrayBuffer()))` |

Kalau cara hitung hash di frontend dan backend berbeda, `verifyFile` di contract akan selalu menghasilkan `false`.
