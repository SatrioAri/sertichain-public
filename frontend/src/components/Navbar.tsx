"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeb3 } from "../context/Web3Context";
import { ProfileModal } from "./ProfileModal";
import {
  ShieldCheck,
  Award,
  Wallet,
  LogOut,
  User,
  ExternalLink,
  Loader2,
  AlertCircle,
  X,
  FileCheck2,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const {
    account,
    role,
    isSepolia,
    isConnecting,
    isSigning,
    profile,
    error,
    connectWallet,
    disconnectWallet,
    clearError,
  } = useWeb3();

  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 transition group-hover:scale-105">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-white group-hover:text-blue-400 transition">
                    SertiChain
                  </span>
                  <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                    ERC-5192
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-none">
                  Soulbound Campus Certificates
                </p>
              </div>
            </Link>

            {/* Navigation Tabs based on Role */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  pathname === "/"
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Beranda
              </Link>

              {role === "admin" && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    pathname.startsWith("/admin")
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                  Dashboard Admin
                </Link>
              )}

              {role === "issuer" && (
                <Link
                  href="/issuer"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    pathname.startsWith("/issuer")
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  <Award className="h-3.5 w-3.5 text-emerald-400" />
                  Dashboard Issuer
                </Link>
              )}

              {/* Holder & Verifier Links (Edo's Scope) */}
              <Link
                href="/holder"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  pathname.startsWith("/holder")
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                Holder
              </Link>

              <Link
                href="/verify"
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  pathname.startsWith("/verify")
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <FileCheck2 className="h-3.5 w-3.5 text-indigo-400" />
                Verifikasi Publik
              </Link>
            </nav>
          </div>

          {/* Right Area: Network Badge, Role Badge, Profile, Wallet */}
          <div className="flex items-center gap-3">
            {/* Role Badge */}
            {role && role !== "none" && (
              <div
                className={`hidden sm:flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                  role === "admin"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                    : role === "issuer"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-purple-500/30 bg-purple-500/10 text-purple-300"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {role === "admin" ? "Role: Admin" : role === "issuer" ? "Role: Issuer" : "Role: Holder"}
              </div>
            )}

            {/* Network Indicator */}
            {account && (
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                  isSepolia
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-400 animate-pulse"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isSepolia ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span className="hidden sm:inline">
                  {isSepolia ? "Sepolia" : "Wrong Network"}
                </span>
              </div>
            )}

            {/* Connect Wallet or User Menu */}
            {account ? (
              <div className="flex items-center gap-2">
                {/* Profile Trigger Button */}
                <button
                  onClick={() => setProfileOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
                  title="Buka Profil Off-chain"
                >
                  <User className="h-3.5 w-3.5 text-blue-400" />
                  <span className="hidden sm:inline">
                    {profile?.full_name ? profile.full_name.split(" ")[0] : "Profil"}
                  </span>
                </button>

                {/* Connected Wallet Button */}
                <a
                  href={`https://sepolia.etherscan.io/address/${account}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-mono font-medium text-slate-200 hover:border-blue-500/40 hover:text-blue-300 transition"
                  title="Lihat di Etherscan"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {`${account.slice(0, 6)}...${account.slice(-4)}`}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>

                {/* Logout Button */}
                <button
                  onClick={disconnectWallet}
                  className="rounded-xl border border-slate-800 p-2 text-slate-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition"
                  title="Logout & Putuskan Wallet"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting || isSigning}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {isConnecting || isSigning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{isSigning ? "Tanda tangan SIWE..." : "Menghubungkan..."}</span>
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4" />
                    <span>Connect Wallet</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Global Web3 Error Banner */}
        {error && (
          <div className="flex items-center justify-between border-t border-red-500/30 bg-red-500/15 px-4 py-2 text-xs text-red-200">
            <div className="mx-auto flex max-w-7xl items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-red-300 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      {/* Profile Modal */}
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
