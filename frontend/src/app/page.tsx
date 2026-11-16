"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useWeb3 } from "../context/Web3Context";
import {
  getContractReadOnly,
  CONTRACT_ADDRESS,
  getReadProvider,
} from "../lib/contract";
import {
  ShieldCheck,
  Award,
  Lock,
  FileCheck,
  ArrowRight,
  ExternalLink,
  Wallet,
  Activity,
  Layers,
  CheckCircle2,
} from "lucide-react";

export default function HomePage() {
  const { account, role, connectWallet, isConnecting } = useWeb3();
  const [totalCerts, setTotalCerts] = useState<number | null>(null);
  // Read here instead of from the wallet session, so visitors who are not logged in see the real state.
  // undefined = still loading, null = could not be read (audit FE-02).
  const [isPaused, setIsPaused] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    // Read total certificates from smart contract view function
    const fetchTotal = async () => {
      try {
        const contract = getContractReadOnly(getReadProvider());
        const [total, paused] = await Promise.all([contract.totalCertificates(), contract.paused()]);
        setTotalCerts(Number(total));
        setIsPaused(paused);
      } catch (err) {
        console.warn("Could not read contract status:", err);
        setIsPaused(null);
      }
    };
    fetchTotal();
  }, []);

  return (
    <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Background Gradient Orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-600/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 right-10 -z-10 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />

      <div className="mx-auto max-w-5xl">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-400 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            Ethereum Sepolia Testnet Live
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Sertifikat Kampus{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-blue-500 bg-clip-text text-transparent">
              Soulbound & Anti-Pemalsuan
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
            Platform terdesentralisasi SertiChain mencatat keaslian sertifikat kegiatan akademik
            sebagai token <span className="text-slate-200 font-medium">ERC-721 Soulbound (ERC-5192)</span> di blockchain Ethereum.
            Tidak dapat dipindahtangankan, terverifikasi publik secara instan, dan berkas tersimpan aman di IPFS.
          </p>

          {/* Dynamic Action Buttons based on Role */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            {!account ? (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-500/25 transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                <span>Hubungkan MetaMask & Masuk</span>
              </button>
            ) : (
              <>
                {role === "admin" && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-500/25 transition hover:brightness-110 active:scale-95"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Masuk ke Dashboard Admin</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}

                {role === "issuer" && (
                  <Link
                    href="/issuer"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-emerald-500/25 transition hover:brightness-110 active:scale-95"
                  >
                    <Award className="h-4 w-4" />
                    <span>Masuk ke Dashboard Issuer</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}

                {role === "holder" && (
                  <Link
                    href="/holder"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-purple-500/25 transition hover:brightness-110 active:scale-95"
                  >
                    <Award className="h-4 w-4" />
                    <span>Lihat Sertifikat Saya</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}

                <Link
                  href="/verify"
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 active:scale-95"
                >
                  <FileCheck className="h-4 w-4 text-indigo-400" />
                  <span>Verifikasi Sertifikat</span>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Live Contract Status Grid */}
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total Sertifikat Terbit</span>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <p className="mt-3 text-3xl font-bold text-white font-mono">
              {totalCerts !== null ? totalCerts : "0"}
            </p>
            <p className="mt-1 text-xs text-slate-400">Tercatat permanen di Sepolia</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Status Smart Contract</span>
              <Layers className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  isPaused == null ? "bg-slate-500" : isPaused ? "bg-red-500 animate-ping" : "bg-emerald-400"
                }`}
              />
              <span
                className={`text-xl font-bold ${
                  isPaused == null ? "text-slate-400" : isPaused ? "text-red-400" : "text-emerald-300"
                }`}
              >
                {isPaused === undefined ? "Memuat..." : isPaused === null ? "Tidak diketahui" : isPaused ? "PAUSED (Darurat)" : "OPERASIONAL (Aktif)"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Pausable OpenZeppelin v5</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Alamat Smart Contract</span>
              <Lock className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-3">
              <a
                href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-mono text-sm font-semibold text-blue-400 hover:text-blue-300 transition"
              >
                {`${CONTRACT_ADDRESS.slice(0, 8)}...${CONTRACT_ADDRESS.slice(-6)}`}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="mt-1 text-xs text-slate-400">Terverifikasi di Sepolia Etherscan</p>
          </div>
        </div>

        {/* Core Architecture Highlights */}
        <div className="mt-14 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white">Arsitektur Keamanan & Prinsip Kerja</h2>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Soulbound Token (ERC-5192)</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Sertifikat terkunci secara permanen pada wallet penerima. Seluruh upaya transfer, jual beli, atau delegasi approval diblokir di tingkat bytecode contract.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Pemisahan Wewenang Ketat</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Admin bertugas mengelola izin dan kontrol darurat tetapi dilarang menerbitkan sertifikat. Hanya wallet bereputasi Issuer yang dapat menerbitkan sertifikat.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Verifikasi Hash Kriptografis (SHA-256)</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Setiap dokumen PDF dihitung nilai hash SHA-256 dan dicocokkan dengan catatan blockchain. Perubahan satu karakter pun akan membatalkan validitas berkas.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Privasi Data Off-Chain</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Data pribadi seperti NIM, email, dan identitas detail tidak pernah diunggah ke blockchain, melainkan disimpan di database off-chain (Supabase) yang hanya bisa diakses lewat backend.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
