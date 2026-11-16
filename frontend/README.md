# Frontend SertiChain

Aplikasi web terdesentralisasi (dApp) untuk SertiChain yang dibangun menggunakan **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **ethers.js v6**, dan integrasi **MetaMask**.

Penanggung jawab: **Rajen** (Admin & Issuer) dan **Edo** (Holder & Verifier).

---

## Fitur yang Diimplementasikan

### 1. Autentikasi & Koneksi Wallet (F-01, F-02, F-03)
- **Connect Wallet:** Mendukung deteksi ekstensi MetaMask dan auto-switch network ke **Ethereum Sepolia (Chain ID: 11155111)**.
- **Sign-In with Ethereum (SIWE / EIP-4361):** Meminta nonce dari backend (`POST /auth/nonce`), meminta tanda tangan pengguna lewat MetaMask, dan memverifikasi ke backend (`POST /auth/verify`) untuk memperoleh sesi JWT.
- **Role-Based Dynamic Access:** Membaca status role secara langsung dari smart contract Sepolia melalui fungsi `hasRole(DEFAULT_ADMIN_ROLE)` dan `hasRole(ISSUER_ROLE)`.
- **Logout:** Menghapus sesi JWT dari `sessionStorage` dan memanggil `POST /auth/logout`.

### 2. Dashboard Admin (F-03, F-04, F-08, F-12, F-13)
- **Manajemen Issuer (F-04):** Mendaftarkan wallet Issuer baru melalui `addIssuer(address)` dan mencabut role melalui `removeIssuer(address)`.
- **Pencabutan Global (F-08):** Mencari sertifikat berdasarkan ID dan mencabut sertifikat (`revokeCertificate(id, reason)`) jika ditemukan pelanggaran.
- **Manajemen Pengguna Off-Chain (F-12):** Menampilkan daftar profil pengguna (`GET /admin/users`) dan menghapus pengguna (`DELETE /admin/users/:id`).
- **Kontrol Darurat (F-13):** Menghentikan sementara smart contract (`pause()`) atau mengaktifkan kembali (`unpause()`).
- **Pemisahan Wewenang:** Dashboard Admin tidak menyediakan fitur penerbitan maupun pengubahan metadata sertifikat.

### 3. Dashboard Issuer, IPFS, & Manajemen Sertifikat (F-03, F-05, F-07, F-08, F-14, F-15)
- **Formulir Penerbitan Sertifikat (F-05):**
  - Input: wallet penerima (bukan 0x0, bukan alamat sendiri), judul kegiatan, jenis sertifikat, tanggal kegiatan (bukan di masa depan).
  - Unggah PDF (maksimal 5 MB, validasi header `%PDF-`).
  - Kalkulasi hash SHA-256 berkas di client (`ethers.sha256`) serta deteksi awal duplikasi via `certificateIdByFileHash`.
  - Unggah PDF ke IPFS (Pinata) melalui `POST /files`.
  - Eksekusi transaksi `issueCertificate(...)` via MetaMask dan pembacaan event `CertificateIssued`.
- **Manajemen Sertifikat Terbitan (F-07, F-08):**
  - Memperbarui metadata sertifikat (`updateCertificate(id, title, certType, eventDate)`).
  - Mencabut sertifikat terbitan Issuer (`revokeCertificate(id, reason)`).
- **Penerbitan Massal CSV (F-15):** Parsing dan pratinjau data sertifikat dari berkas CSV.
- **Riwayat Aktivitas Blockchain (F-14):** Menampilkan log kronologis dari event blockchain `CertificateIssued` dan `CertificateUpdated`.

### 4. Dashboard Holder (F-06): `/holder`
- Membaca daftar sertifikat milik wallet yang terhubung lewat `getCertificatesByOwner(address)` lalu `getCertificate(id)`.
- Status tiap sertifikat (Valid atau Dicabut beserta alasan dan tanggalnya).
- Bagikan sertifikat: salin tautan `/verify?id=<id>` atau tampilkan QR code tautan tersebut, plus tautan PDF di IPFS.

### 5. Verifikasi Publik (F-09, F-10): `/verify`
- Bisa dibuka siapa pun tanpa login dan tanpa MetaMask. Data dibaca langsung dari contract lewat RPC publik (`NEXT_PUBLIC_RPC_URL`).
- Cek berdasarkan ID (`/verify?id=1` dari tautan atau QR langsung diperiksa), berdasarkan berkas PDF saja (ID dicari lewat `certificateIdByFileHash`), atau keduanya.
- Hash PDF dihitung di browser, lalu dicocokkan memakai `verifyFile(id, hash)` di contract. Berkas tidak diunggah ke mana pun.
- Hasil: **Valid**, **Dicabut** (dengan alasan dan tanggal), **Berkas Tidak Cocok**, atau **Tidak Ditemukan**. Nama penerima diambil dari `GET /public/profiles/:wallet` (hanya nama).

### 6. Pengelolaan Profil Pengguna Off-Chain (F-11)
- Modal profil untuk melihat (`GET /users/me`), membuat (`POST /users/me`), mengubah (`PUT /users/me`), dan menghapus (`DELETE /users/me`) data profil off-chain.

---

## Menjalankan Frontend Secara Lokal

### 1. Instalasi Dependensi
```bash
cd frontend
npm install
```

### 2. Konfigurasi Environment (`.env.local`)
Salin `.env.example` menjadi `.env.local`:
```bash
# Windows
copy .env.example .env.local

# macOS/Linux
cp .env.example .env.local
```

Nilai bawaan di `.env.example` sudah siap dipakai untuk contract di Sepolia dan backend lokal di port 4000.

`NEXT_PUBLIC_USE_MOCK_API` harus `false` saat demo. Kalau `true`, login, profil, dan upload hanya disimulasikan di browser (berguna untuk mengerjakan tampilan tanpa backend), dan penerbitan sertifikat sengaja ditolak supaya CID palsu tidak masuk ke Sepolia. Saat `false`, kalau backend mati, frontend menampilkan pesan error, tidak diam-diam beralih ke mock.

### 3. Menjalankan Server Development
```bash
npm run dev
```
Buka browser di [http://localhost:3000](http://localhost:3000).

---

## Akun Pengujian di Jaringan Sepolia

| Peran | Alamat Wallet | Keterangan |
| --- | --- | --- |
| **Admin** | `0x5eDebdC977AC66de68D2b7a7EC717382db98D002` | Pemegang `DEFAULT_ADMIN_ROLE` |
| **Issuer** | `0x821b1DA745835553c56a87BE2141744486b2056a` | Pemegang `ISSUER_ROLE` |
