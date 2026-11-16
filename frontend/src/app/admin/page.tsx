"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../../context/Web3Context";
import {
  getContractReadOnly,
  getContractWithSigner,
  parseContractError,
  ISSUER_ROLE,
  CertificateData,
  getReadProvider,
  readContractEventsSinceDeploy,
} from "../../lib/contract";
import { api, UserProfile } from "../../lib/api";
import { ethers } from "ethers";
import {
  ShieldAlert,
  UserCheck,
  UserMinus,
  UserPlus,
  Trash2,
  Pause,
  Play,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Users,
  Shield,
  RefreshCw,
} from "lucide-react";

export default function AdminDashboardPage() {
  const { account, role, isPaused, isPauseKnown, getSigner, connectWallet, refreshContractState } = useWeb3();

  // Active Tab
  const [activeTab, setActiveTab] = useState<"issuers" | "revoke" | "users" | "emergency">("issuers");

  // State: Issuer Management (F-04)
  const [issuerInput, setIssuerInput] = useState("");
  const [issuersList, setIssuersList] = useState<{ address: string; active: boolean }[]>([]);
  const [loadingIssuers, setLoadingIssuers] = useState(false);
  const [issuersError, setIssuersError] = useState<string | null>(null);
  const [issuerActionLoading, setIssuerActionLoading] = useState(false);

  // State: Certificate Revoke (F-08)
  const [searchCertId, setSearchCertId] = useState("");
  const [searchedCert, setSearchedCert] = useState<CertificateData | null>(null);
  const [searchingCert, setSearchingCert] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  // State: Off-chain Users (F-12)
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // State: Emergency Pause/Unpause (F-13)
  const [togglingPause, setTogglingPause] = useState(false);

  // General Notification / Feedback
  const [alert, setAlert] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showAlert = (message: string, type: "success" | "error") => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 6000);
  };

  // 1. Load Issuers from Contract Events
  // Built from RoleGranted/RoleRevoked since deployment, so an issuer added through the inherited grantRole
  // (which emits no IssuerAdded) or added long ago still shows up (audit SC-01).
  const loadIssuers = useCallback(async () => {
    setLoadingIssuers(true);
    setIssuersError(null);
    try {
      const { events, provider } = await readContractEventsSinceDeploy(["RoleGranted", "RoleRevoked"]);
      const addresses = new Set<string>();
      for (const ev of events) {
        if (ev.args.role === ISSUER_ROLE) addresses.add((ev.args.account as string).toLowerCase());
      }

      // Events only say who was ever touched; hasRole says who holds the role now.
      const contract = getContractReadOnly(provider);
      const results = await Promise.all(
        [...addresses].map(async (address) => ({ address, active: (await contract.hasRole(ISSUER_ROLE, address)) as boolean }))
      );
      results.sort((x, y) => Number(y.active) - Number(x.active));
      setIssuersList(results);
    } catch (err) {
      console.warn("Failed to load issuers:", err);
      setIssuersError("Gagal membaca daftar Issuer dari Sepolia. Daftar mungkin tidak lengkap, klik Segarkan untuk mencoba lagi.");
    } finally {
      setLoadingIssuers(false);
    }
  }, []);

  // 2. Load Off-chain Users (F-12)
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await api.getAdminUsers(userPage, 10);
      setUsersList(res.users);
      setUserTotal(res.total);
    } catch (err: any) {
      console.warn("Could not load off-chain users:", err);
      // Without this, a failed request (expired session, backend down) looks the same as an empty table.
      setUsersError(err?.message || "Gagal memuat daftar pengguna dari backend.");
    } finally {
      setLoadingUsers(false);
    }
  }, [userPage]);

  useEffect(() => {
    if (role === "admin") {
      loadIssuers();
      loadUsers();
    }
  }, [role, loadIssuers, loadUsers]);

  // Action: Add Issuer (F-04)
  const handleAddIssuer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ethers.isAddress(issuerInput)) {
      showAlert("Alamat wallet Ethereum tidak valid.", "error");
      return;
    }

    setIssuerActionLoading(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap atau terputus.");

      const formattedIssuer = ethers.getAddress(issuerInput.trim());
      const contract = getContractWithSigner(signer);
      const tx = await contract.addIssuer(formattedIssuer);
      showAlert(`Transaksi dikirim (${tx.hash.slice(0, 10)}...). Menunggu konfirmasi Sepolia...`, "success");

      await tx.wait();
      showAlert(`Berhasil menambahkan ${formattedIssuer} sebagai Issuer resmi!`, "success");
      setIssuerInput("");
      await loadIssuers();
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setIssuerActionLoading(false);
    }
  };

  // Action: Remove Issuer (F-04)
  const handleRemoveIssuer = async (issuerAddress: string) => {
    if (!confirm(`Cabut role Issuer dari wallet ${issuerAddress}?`)) return;

    setIssuerActionLoading(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap.");

      const contract = getContractWithSigner(signer);
      const tx = await contract.removeIssuer(issuerAddress);
      showAlert(`Transaksi pencabutan dikirim. Menunggu konfirmasi Sepolia...`, "success");

      await tx.wait();
      showAlert(`Role Issuer untuk ${issuerAddress} berhasil dicabut!`, "success");
      await loadIssuers();
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setIssuerActionLoading(false);
    }
  };

  // Action: Search Certificate for Revoke (F-08)
  const handleSearchCert = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(searchCertId);
    if (isNaN(id) || id <= 0) {
      showAlert("Masukkan ID sertifikat yang valid (angka positif).", "error");
      return;
    }

    setSearchingCert(true);
    setSearchedCert(null);
    try {
      const signer = await getSigner();
      const provider = signer?.provider || getReadProvider();
      const contract = getContractReadOnly(provider);

      const cert = await contract.getCertificate(id);
      setSearchedCert({
        id,
        issuer: cert.issuer,
        recipient: cert.recipient,
        title: cert.title,
        certType: cert.certType,
        eventDate: Number(cert.eventDate),
        issuedAt: Number(cert.issuedAt),
        fileHash: cert.fileHash,
        fileCID: cert.fileCID,
        revoked: cert.revoked,
        revokeReason: cert.revokeReason,
        revokedAt: Number(cert.revokedAt),
      });
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setSearchingCert(false);
    }
  };

  // Action: Revoke Certificate (F-08)
  const handleRevokeCert = async () => {
    if (!searchedCert) return;
    if (!revokeReason.trim()) {
      showAlert("Alasan pencabutan wajib diisi.", "error");
      return;
    }

    setRevoking(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap.");

      const contract = getContractWithSigner(signer);
      const tx = await contract.revokeCertificate(searchedCert.id, revokeReason.trim());
      showAlert(`Transaksi pencabutan sertifikat dikirim. Menunggu konfirmasi...`, "success");

      await tx.wait();
      showAlert(`Sertifikat #${searchedCert.id} berhasil dicabut dari peredaran.`, "success");
      setRevokeReason("");

      // Refresh searched cert
      const updated = await contract.getCertificate(searchedCert.id);
      setSearchedCert({
        ...searchedCert,
        revoked: updated.revoked,
        revokeReason: updated.revokeReason,
        revokedAt: Number(updated.revokedAt),
      });
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setRevoking(false);
    }
  };

  // Action: Delete Off-chain User (F-12)
  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Hapus akun pengguna "${name}" dari database off-chain?`)) return;

    setDeletingUserId(id);
    try {
      await api.deleteAdminUser(id);
      showAlert(`Akun pengguna "${name}" berhasil dihapus.`, "success");
      await loadUsers();
    } catch (err: any) {
      showAlert(err.message || "Gagal menghapus pengguna.", "error");
    } finally {
      setDeletingUserId(null);
    }
  };

  // Action: Toggle Contract Pause (F-13)
  const handleTogglePause = async () => {
    const actionName = isPaused ? "mengaktifkan kembali (UNPAUSE)" : "menghentikan sementara (PAUSE)";
    if (!confirm(`Konfirmasi tindakan darurat: Apakah Anda yakin ingin ${actionName} smart contract?`)) {
      return;
    }

    setTogglingPause(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap.");

      const contract = getContractWithSigner(signer);
      const tx = isPaused ? await contract.unpause() : await contract.pause();
      showAlert(`Transaksi darurat ${isPaused ? "unpause" : "pause"} dikirim. Menunggu konfirmasi...`, "success");

      await tx.wait();
      await refreshContractState();
      showAlert(`Status kontrak berhasil diubah menjadi: ${!isPaused ? "PAUSED (Darurat)" : "OPERASIONAL"}!`, "success");
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setTogglingPause(false);
    }
  };

  // Access Control Guard
  if (!account) {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Shield className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-white">Dashboard Khusus Admin</h2>
        <p className="mt-2 text-sm text-slate-400">
          Halaman ini dilindungi oleh otentikasi smart contract. Silakan hubungkan wallet MetaMask yang memegang role <span className="font-mono text-blue-400">DEFAULT_ADMIN_ROLE</span>.
        </p>
        <button
          onClick={connectWallet}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 transition active:scale-95"
        >
          Hubungkan Wallet Admin
        </button>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-red-300">Akses Ditolak: Bukan Admin</h2>
        <p className="mt-2 text-sm text-slate-400">
          Alamat wallet terhubung <span className="font-mono text-slate-300">{account}</span> tidak memiliki role Admin di smart contract SertiChain.
        </p>
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 text-left">
          <p className="font-semibold text-slate-300 mb-1">Catatan Pemisahan Wewenang (PRD Bagian 3):</p>
          <p>
            Akun Admin hanya berwenang menambah/mencabut Issuer, mencabut sertifikat, dan kontrol darurat. Sesuai aturan arsitektur, satu wallet tidak dapat menjadi Admin sekaligus Issuer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Shield className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Admin</h1>
            <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
              DEFAULT_ADMIN_ROLE
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Kelola izin Issuer, pencabutan darurat sertifikat, manajemen pengguna off-chain, dan kontrol smart contract.
          </p>
        </div>

        {/* Emergency Pause Quick Indicator */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
              !isPauseKnown
                ? "border-slate-600 bg-slate-800/60 text-slate-300"
                : isPaused
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                !isPauseKnown ? "bg-slate-400" : isPaused ? "bg-red-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
            {!isPauseKnown
              ? "Contract Status: TIDAK DIKETAHUI"
              : isPaused
                ? "Contract Status: PAUSED"
                : "Contract Status: OPERASIONAL"}
          </div>

          <button
            onClick={() => setActiveTab("emergency")}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white transition"
          >
            Kontrol Darurat
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
      {alert && (
        <div
          className={`mt-6 flex items-center justify-between rounded-xl border p-4 text-sm ${
            alert.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
              : "border-red-500/40 bg-red-500/15 text-red-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {alert.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
            )}
            <span>{alert.message}</span>
          </div>
          <button onClick={() => setAlert(null)} className="text-xs font-bold opacity-70 hover:opacity-100">
            Tutup
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("issuers")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "issuers"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Manajemen Issuer (F-04)
        </button>

        <button
          onClick={() => setActiveTab("revoke")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "revoke"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          Pencabutan Global (F-08)
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "users"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <Users className="h-4 w-4" />
          Pengguna Off-Chain (F-12)
        </button>

        <button
          onClick={() => setActiveTab("emergency")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "emergency"
              ? "bg-red-600 text-white shadow-md shadow-red-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Kontrol Darurat (F-13)
        </button>
      </div>

      {/* TAB 1: Manajemen Issuer (F-04) */}
      {activeTab === "issuers" && (
        <div className="mt-6 space-y-6">
          {/* Add Issuer Form */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-blue-400" />
              Daftarkan Issuer Baru
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Memberikan role <span className="font-mono text-emerald-400">ISSUER_ROLE</span> di smart contract Sepolia. Issuer berhak menerbitkan sertifikat.
            </p>

            <form onSubmit={handleAddIssuer} className="mt-4 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Alamat wallet Issuer (0x...)"
                value={issuerInput}
                onChange={(e) => setIssuerInput(e.target.value)}
                required
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={issuerActionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
              >
                {issuerActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Tambah Issuer
              </button>
            </form>
          </div>

          {/* Issuers List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Daftar Issuer Terdaftar</h3>
                <p className="text-xs text-slate-400">Diverifikasi langsung via <span className="font-mono">hasRole</span> smart contract</p>
              </div>
              <button
                onClick={loadIssuers}
                disabled={loadingIssuers}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingIssuers ? "animate-spin" : ""}`} />
                Segarkan
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-800">
              {loadingIssuers ? (
                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  Membaca data Issuer dari Sepolia...
                </div>
              ) : issuersError ? (
                <p role="alert" className="py-6 text-center text-xs text-red-400">{issuersError}</p>
              ) : issuersList.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">Belum ada data Issuer.</p>
              ) : (
                issuersList.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${item.active ? "bg-emerald-400" : "bg-slate-600"}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-white">{item.address}</span>
                          <a
                            href={`https://sepolia.etherscan.io/address/${item.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-blue-400"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {item.active ? "Aktif (Dapat menerbitkan sertifikat)" : "Dicabut / Nonaktif"}
                        </span>
                      </div>
                    </div>

                    {item.active && (
                      <button
                        onClick={() => handleRemoveIssuer(item.address)}
                        disabled={issuerActionLoading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition active:scale-95 disabled:opacity-50"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Cabut Izin
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Pencabutan Global Sertifikat (F-08) */}
      {activeTab === "revoke" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-400" />
              Cari & Cabut Sertifikat (Hak Istimewa Admin)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Sebagai Admin, Anda dapat mencabut seluruh sertifikat jika ditemukan pelanggaran atau kecurangan, meskipun sertifikat diterbitkan oleh Issuer lain.
            </p>

            <form onSubmit={handleSearchCert} className="mt-4 flex flex-col sm:flex-row gap-3">
              <input
                type="number"
                placeholder="Masukkan ID Sertifikat (misal: 1, 2, ...)"
                value={searchCertId}
                onChange={(e) => setSearchCertId(e.target.value)}
                min="1"
                required
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={searchingCert}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
              >
                {searchingCert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Cek Sertifikat
              </button>
            </form>

            {/* Certificate Details Result */}
            {searchedCert && (
              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs text-slate-400">Sertifikat Token ID</span>
                    <h3 className="text-lg font-bold text-white font-mono">#{searchedCert.id}</h3>
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-xs font-bold border ${
                      searchedCert.revoked
                        ? "border-red-500/40 bg-red-500/15 text-red-300"
                        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {searchedCert.revoked ? "STATUS: DICABUT (REVOKED)" : "STATUS: SAH / AKTIF"}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="text-slate-400">Nama Kegiatan / Judul:</span>
                    <p className="font-semibold text-white text-sm">{searchedCert.title}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Jenis Sertifikat:</span>
                    <p className="font-semibold text-white">{searchedCert.certType}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Wallet Penerima (Holder):</span>
                    <p className="font-mono text-slate-200">{searchedCert.recipient}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Wallet Penerbit (Issuer):</span>
                    <p className="font-mono text-slate-200">{searchedCert.issuer}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Tanggal Kegiatan:</span>
                    <p className="text-slate-200">{new Date(searchedCert.eventDate * 1000).toLocaleDateString("id-ID")}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Diterbitkan Pada:</span>
                    <p className="text-slate-200">{new Date(searchedCert.issuedAt * 1000).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-400">IPFS CID:</span>
                    <p className="font-mono text-blue-400 break-all">{searchedCert.fileCID}</p>
                  </div>
                </div>

                {searchedCert.revoked ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Detail Pencabutan:
                    </div>
                    <p>Alasan: &ldquo;{searchedCert.revokeReason}&rdquo;</p>
                    <p>Waktu Pencabutan: {new Date(searchedCert.revokedAt * 1000).toLocaleString("id-ID")}</p>
                  </div>
                ) : (
                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    <label className="block text-xs font-medium text-slate-300">
                      Alasan Pencabutan Sertifikat <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Ditemukan pemalsuan data kehadiran peserta atau pembatalan sertifikat"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      maxLength={200}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                    />
                    <button
                      onClick={handleRevokeCert}
                      disabled={revoking || !revokeReason.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-500/25 transition hover:bg-red-500 active:scale-95 disabled:opacity-50"
                    >
                      {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Eksekusi Pencabutan Sertifikat #{searchedCert.id}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Manajemen Pengguna Off-Chain (F-12) */}
      {activeTab === "users" && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                Manajemen Pengguna Off-Chain (F-12)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Data profil disimpan di database Supabase/PostgreSQL. Admin dapat meninjau dan menghapus akun jika diperlukan.
              </p>
            </div>
            <button
              onClick={loadUsers}
              disabled={loadingUsers}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
              Segarkan
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Alamat Wallet</th>
                  <th className="py-3 px-4">NIM / ID</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        Memuat data pengguna off-chain...
                      </div>
                    </td>
                  </tr>
                ) : usersError ? (
                  <tr>
                    <td colSpan={5} role="alert" className="py-8 text-center text-red-400">
                      {usersError}
                    </td>
                  </tr>
                ) : usersList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada pengguna yang membuat profil. Profil dibuat lewat menu Profil setelah login.
                    </td>
                  </tr>
                ) : (
                  usersList.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-semibold text-white">{user.full_name}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {user.wallet_address ? `${user.wallet_address.slice(0, 8)}...${user.wallet_address.slice(-6)}` : "-"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">{user.student_id || "-"}</td>
                      <td className="py-3.5 px-4 text-slate-400">{user.email || "-"}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDeleteUser(user.id, user.full_name)}
                          disabled={deletingUserId === user.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
                        >
                          {deletingUserId === user.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Hapus Akun
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {userTotal > 10 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
              <span>
                Menampilkan halaman {userPage} dari {Math.ceil(userTotal / 10)} ({userTotal} total pengguna)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                  disabled={userPage <= 1 || loadingUsers}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  onClick={() => setUserPage((p) => (p * 10 < userTotal ? p + 1 : p))}
                  disabled={userPage * 10 >= userTotal || loadingUsers}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Kontrol Darurat Smart Contract (F-13) */}
      {activeTab === "emergency" && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-slate-900/60 p-6 backdrop-blur-xl">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Kontrol Darurat: Pause & Unpause Kontrak (F-13)
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Fitur pengaman darurat OpenZeppelin Pausable. Digunakan saat terjadi insiden keamanan, eksploitasi, atau pemeliharaan sistem.
          </p>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Status Operasi Saat Ini:</span>
                <p className={`text-lg font-bold ${!isPauseKnown ? "text-slate-300" : isPaused ? "text-red-400" : "text-emerald-400"}`}>
                  {!isPauseKnown
                    ? "TIDAK DIKETAHUI (gagal membaca kontrak)"
                    : isPaused
                      ? "DIHENTIKAN SEMENTARA (PAUSED)"
                      : "AKTIF / NORMAL (UNPAUSED)"}
                </p>
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                  isPaused
                    ? "border-red-500/40 bg-red-500/15 text-red-300"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {isPaused ? "Emergency Mode" : "Normal Mode"}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-300">Dampak Status Pause:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Fungsi <span className="font-mono text-amber-300">issueCertificate</span> akan gagal (revert <span className="font-mono">EnforcedPause</span>).</li>
                <li>Fungsi <span className="font-mono text-amber-300">updateCertificate</span> dan <span className="font-mono text-amber-300">revokeCertificate</span> dinonaktifkan.</li>
                <li>Fungsi view dan verifikasi publik tetap dapat diakses normal tanpa hambatan.</li>
                <li>
                  Admin juga tidak bisa mencabut sertifikat selama pause. Urutan penanganan kunci Issuer yang bocor: pause, hapus
                  Issuer di tab Manajemen Issuer, unpause, lalu cabut sertifikat palsunya.
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                onClick={handleTogglePause}
                // With an unknown state the button could send the opposite of what the admin intends.
                disabled={togglingPause || !isPauseKnown}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-semibold text-white shadow-lg transition active:scale-95 disabled:opacity-50 ${
                  isPaused
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25"
                    : "bg-red-600 hover:bg-red-500 shadow-red-500/25"
                }`}
              >
                {togglingPause ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPaused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
                {isPaused ? "Pulihkan Smart Contract (UNPAUSE)" : "Hentikan Sementara Smart Contract (PAUSE)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
