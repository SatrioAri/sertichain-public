"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileCheck2,
  Loader2,
  QrCode,
  RefreshCw,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useWeb3 } from "../../context/Web3Context";
import {
  CertificateData,
  getContractReadOnly,
  getReadProvider,
  ipfsUrl,
  toCertificateData,
} from "../../lib/contract";

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function verifyLink(id: number): string {
  return `${window.location.origin}/verify?id=${id}`;
}

export default function HolderPage() {
  const { account, connectWallet, isConnecting } = useWeb3();
  const [certs, setCerts] = useState<CertificateData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCert, setQrCert] = useState<CertificateData | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadCertificates = useCallback(async () => {
    if (!account) return;
    setIsLoading(true);
    setError(null);
    try {
      const contract = getContractReadOnly(getReadProvider());
      const ids: bigint[] = await contract.getCertificatesByOwner(account);
      const loaded = await Promise.all(
        ids.map(async (id) => toCertificateData(Number(id), await contract.getCertificate(id)))
      );
      loaded.sort((a, b) => b.id - a.id);
      setCerts(loaded);
    } catch (err) {
      console.error("Failed to load holder certificates:", err);
      setError("Gagal memuat sertifikat dari jaringan Sepolia. Coba muat ulang.");
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    setCerts([]);
    loadCertificates();
  }, [loadCertificates]);

  useEffect(() => {
    if (!qrCert) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrCert(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [qrCert]);

  const copyLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(verifyLink(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      setError("Browser menolak akses clipboard. Salin tautan dari tombol QR.");
    }
  };

  if (!account) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-400">
          <User className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">Sertifikat Saya</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Hubungkan wallet penerima sertifikat untuk melihat semua sertifikat yang Anda miliki dan membagikan tautan
          verifikasinya.
        </p>
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-60"
        >
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Hubungkan MetaMask
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sertifikat Saya</h1>
          <p className="mt-1 text-sm text-slate-400">
            Sertifikat soulbound milik <span className="font-mono text-slate-300">{account.slice(0, 6)}...{account.slice(-4)}</span>.
            Bagikan tautan atau QR code ke HRD atau pihak lain untuk verifikasi.
          </p>
        </div>
        <button
          onClick={loadCertificates}
          disabled={isLoading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Muat ulang
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {isLoading && certs.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Membaca sertifikat dari Sepolia...</p>
        </div>
      )}

      {!isLoading && !error && certs.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <FileCheck2 className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 font-medium text-slate-200">Belum ada sertifikat di wallet ini</p>
          <p className="mt-1 text-sm text-slate-400">
            Sertifikat akan muncul di sini setelah Issuer menerbitkannya ke alamat wallet Anda.
          </p>
        </div>
      )}

      {certs.length > 0 && (
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {certs.map((cert) => (
            <li key={cert.id} className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Sertifikat #{cert.id} &middot; {cert.certType}</p>
                  <h2 className="mt-1 break-words text-base font-semibold text-white">{cert.title}</h2>
                </div>
                {cert.revoked ? (
                  <span className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300">
                    Dicabut
                  </span>
                ) : (
                  <span className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    Valid
                  </span>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Tanggal kegiatan</dt>
                  <dd className="text-slate-200">{formatDate(cert.eventDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Diterbitkan</dt>
                  <dd className="text-slate-200">{formatDate(cert.issuedAt)}</dd>
                </div>
              </dl>

              {cert.revoked && (
                <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  Dicabut {formatDate(cert.revokedAt)}: {cert.revokeReason}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                <button
                  onClick={() => copyLink(cert.id)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-purple-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
                >
                  {copiedId === cert.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedId === cert.id ? "Tersalin" : "Salin tautan"}
                </button>
                <button
                  onClick={() => setQrCert(cert)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
                >
                  <QrCode className="h-4 w-4" />
                  QR code
                </button>
                {ipfsUrl(cert.fileCID) && (
                  <a
                    href={ipfsUrl(cert.fileCID)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
                  >
                    PDF
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Link
                  href={`/verify?id=${cert.id}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
                >
                  Halaman verifikasi
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {qrCert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setQrCert(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 text-left">
              <div>
                <h2 id="qr-title" className="font-semibold text-white">QR verifikasi #{qrCert.id}</h2>
                <p className="text-xs text-slate-400">{qrCert.title}</p>
              </div>
              <button
                onClick={() => setQrCert(null)}
                autoFocus
                aria-label="Tutup"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* A white quiet zone keeps the code scannable on the dark theme. */}
            <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-4">
              <QRCodeSVG value={verifyLink(qrCert.id)} size={208} level="M" />
            </div>
            <p className="mt-4 break-all font-mono text-xs text-slate-400">{verifyLink(qrCert.id)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
