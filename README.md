# SertiChain

dApp untuk menerbitkan dan memverifikasi sertifikat kegiatan kampus. Setiap sertifikat dicatat sebagai token ERC-721 soulbound (ERC-5192) di Ethereum testnet Sepolia, jadi keasliannya bisa dicek siapa pun tanpa menghubungi penerbit.

Mini project mata kuliah Blockchain Fundamental (COMP6873001), BINUS University.

## Anggota dan Peran

| Anggota | Peran |
| --- | --- |
| Satrio | Project Lead + Smart Contract (development dan testing) |
| Sebastian | Dokumentasi |
| Shamuel | Backend Developer |
| Rajen | Frontend Developer (Admin & Issuer) |
| Edo | Frontend Developer (Holder & Verifier) |

## Struktur Repository

```text
sertichain/
  contracts/   smart contract, script deploy, unit test (Hardhat)
  backend/     API Express, koneksi ke Supabase
  frontend/    aplikasi Next.js
  docs/        PRD, laporan, slide
```

## Tech Stack

| Komponen | Teknologi |
| --- | --- |
| Smart contract | Solidity 0.8.34, OpenZeppelin v5, Hardhat 3, Slither |
| Jaringan | Ethereum testnet Sepolia |
| Frontend | Next.js, ethers.js, MetaMask |
| Backend | Node.js, Express, Sign-In with Ethereum (EIP-4361), JWT |
| Database | Supabase (PostgreSQL) |
| Penyimpanan file | IPFS lewat Pinata |

Saat demo, frontend dan backend dijalankan lokal. Smart contract tetap di Sepolia.

## Aturan Kerja

1. Jangan push langsung ke `main`. Buat branch per fitur, misalnya `feat/issue-certificate` atau `fix/login-nonce`.
2. Setiap pull request di-review minimal satu anggota lain sebelum di-merge.
3. Pesan commit memakai awalan `feat:`, `fix:`, `test:`, `docs:`, atau `chore:`.
4. File `.env` tidak boleh di-commit. Setiap folder yang butuh konfigurasi menyediakan `.env.example` berisi nama variabel tanpa nilai aslinya.
5. Private key deployer memakai wallet khusus testnet, bukan wallet pribadi.

Aplikasi ini akan diaudit kelompok lain secara white-box, termasuk riwayat commit. Secret yang sempat ter-commit tetap bisa ditemukan walaupun file-nya sudah dihapus, jadi cek `git status` sebelum setiap commit.

## Menjalankan Project
Panduan menjalankan tiap bagian:

| Bagian | Panduan |
| --- | --- |
| Smart contract | Bagian "Smart Contract" di bawah |
| Backend | [`backend/README.md`](backend/README.md), termasuk roadmap endpoint |
| Frontend | [`frontend/README.md`](frontend/README.md) |

Urutan menjalankan untuk demo (dua terminal):

1. Backend: `cd backend`, isi `.env` dari `.env.example`, jalankan `db/schema.sql` di Supabase, lalu `npm install` dan `npm run dev` (port 4000).
2. Frontend: `cd frontend`, salin `.env.example` ke `.env.local`, lalu `npm install` dan `npm run dev` (port 3000).
3. Buka `http://localhost:3000`. Admin di `/admin`, Issuer di `/issuer`, Holder di `/holder`, verifikasi publik di `/verify` (tanpa login).

## Smart Contract (wajib dibaca tim frontend dan backend)

Contract `SertiChain.sol` menyimpan sertifikat sebagai token ERC-721 soulbound (ERC-5192). Dibangun dengan Hardhat 3 (template mocha + ethers) dan OpenZeppelin v5. Penanggung jawab: Satrio.

Semua perintah di bagian ini dijalankan dari folder `contracts/`.

### Contract yang sudah di-deploy

| Item | Nilai |
| --- | --- |
| Jaringan | Ethereum Sepolia (chain ID `11155111`) |
| Alamat contract | `0x6cF38b6A9059477d39dC8230e5773Dcea793fDb4` |
| Etherscan | [Source code terverifikasi](https://sepolia.etherscan.io/address/0x6cF38b6A9059477d39dC8230e5773Dcea793fDb4#code) |
| Admin awal | `0x5eDebdC977AC66de68D2b7a7EC717382db98D002` |
| ABI | `contracts/ignition/deployments/chain-11155111/artifacts/SertiChainModule#SertiChain.json` (bagian `abi`) |

Frontend dan backend cukup memakai alamat dan ABI di atas, tidak perlu deploy sendiri. Kalau contract di-deploy ulang, alamatnya berubah dan tabel ini wajib diperbarui.

### Menjalankan dan testing

Butuh Node.js 22.13 atau lebih baru.

```bash
cd contracts
npm install
npx hardhat build
npx hardhat test
```

### Deploy ke Sepolia

Simpan RPC URL dan private key wallet deployer di keystore Hardhat (terenkripsi, tidak masuk Git):

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/SertiChain.ts
```

Verifikasi source code di Etherscan (tidak men-deploy ulang, hanya mengirim source code):

```bash
npx hardhat keystore set ETHERSCAN_API_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/SertiChain.ts --verify
```

Wallet deployer otomatis menjadi Admin pertama. Pakai wallet khusus testnet, dan jangan jadikan wallet ini Issuer: contract menolak satu wallet memegang role Admin dan Issuer sekaligus.

Hasil deploy (alamat dan ABI) tersimpan di `ignition/deployments/chain-11155111/`. Commit folder itu, lalu perbarui tabel "Contract yang sudah di-deploy" di atas.

### Role

| Role | Cara cek | Keterangan |
| --- | --- | --- |
| Admin | `hasRole(DEFAULT_ADMIN_ROLE, addr)` | `DEFAULT_ADMIN_ROLE` = `0x00…00` |
| Issuer | `hasRole(ISSUER_ROLE, addr)` | `ISSUER_ROLE` = `keccak256("ISSUER_ROLE")` |
| Holder | `balanceOf(addr) > 0` | Ditentukan dari kepemilikan token |
| Verifier | Tidak perlu | Semua fungsi view bisa dipanggil siapa pun |

### Fungsi

| Fungsi | Pemanggil | Catatan |
| --- | --- | --- |
| `addIssuer(address)` / `removeIssuer(address)` | Admin | |
| `issueCertificate(recipient, title, certType, eventDate, fileHash, fileCID)` | Issuer | Mengembalikan id sertifikat (mulai dari 1) |
| `updateCertificate(id, title, certType, eventDate)` | Issuer penerbit | Tidak bisa mengubah penerima, hash, atau CID |
| `revokeCertificate(id, reason)` | Issuer penerbit atau Admin | Soft delete, data tetap tersimpan |
| `pause()` / `unpause()` | Admin | Menghentikan issue, update, revoke |
| `getCertificate(id)` | Semua | Revert `CertificateNotFound` jika id tidak ada |
| `getCertificatesByOwner(address)` | Semua | Daftar id milik wallet |
| `certificateIdByFileHash(bytes32)` | Semua | Cari id dari hash file, 0 jika tidak ada |
| `verifyFile(id, fileHash)` | Semua | `true` hanya jika hash cocok dan belum dicabut |
| `totalCertificates()` | Semua | |
| `locked(id)` | Semua | Selalu `true` (ERC-5192) |

Format data:

- `eventDate`: unix timestamp dalam detik. Harus lebih dari 0 dan tidak boleh di masa depan.
- `fileHash`: SHA-256 dari file PDF sebagai `bytes32`. Di ethers.js: `ethers.sha256(new Uint8Array(await file.arrayBuffer()))`.
- `fileCID`: CID dari Pinata, maksimal 100 karakter.
- `title`, `certType`, `reason`: tidak boleh kosong, maksimal 200 byte.

### Event

`IssuerAdded`, `IssuerRemoved`, `CertificateIssued`, `CertificateUpdated`, `CertificateRevoked`, `Locked`, plus event bawaan ERC-721 dan AccessControl (`Transfer`, `RoleGranted`, `RoleRevoked`).

### Custom error

Error yang perlu ditangani frontend agar pesannya jelas bagi pengguna:

| Error | Arti |
| --- | --- |
| `AccessControlUnauthorizedAccount` | Wallet tidak punya role yang dibutuhkan |
| `AdminCannotBeIssuer` | Wallet Admin tidak boleh menjadi Issuer, dan sebaliknya |
| `SelfIssuance` | Issuer mencoba menerbitkan sertifikat untuk dirinya sendiri |
| `EmptyField`, `TextTooLong` | Input teks kosong atau terlalu panjang |
| `InvalidEventDate` | Tanggal kegiatan kosong atau di masa depan |
| `EmptyFileHash`, `DuplicateFileHash` | Hash file kosong, atau file sudah pernah dipakai |
| `CertificateNotFound` | Id tidak ada |
| `CertificateAlreadyRevoked` | Sertifikat sudah dicabut |
| `NotCertificateIssuer`, `NotAllowedToRevoke` | Bukan penerbit sertifikat tersebut |
| `Soulbound` | Transfer atau approve tidak diizinkan |
| `EnforcedPause` | Contract sedang di-pause |
