"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Loader2,
  SearchX,
  Upload,
  XCircle,
} from "lucide-react";
import {
  CONTRACT_ADDRESS,
  CertificateData,
  EXPLORER_URL,
  ISSUER_ROLE,
  computePdfHash,
  getContractReadOnly,
  getReadProvider,
  ipfsUrl,
  toCertificateData,
} from "../../lib/contract";
import { api } from "../../lib/api";

// "recorded" = the certificate exists and is not revoked, but no file was compared. Only "valid" means the
// PDF in hand matches the hash on chain (audit FE-01).
type VerifyStatus = "valid" | "recorded" | "revoked" | "hash_mismatch" | "not_found";

interface VerifyResult {
  status: VerifyStatus;
  cert: CertificateData | null;
  recipientName: string | null;
  // False when the issuing wallet no longer holds ISSUER_ROLE (removed, possibly after a key compromise).
  issuerActive: boolean;
  fileChecked: boolean;
  fileHash: string | null;
}

const MAX_PDF_BYTES = 5 * 1024 * 1024;

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [idInput, setIdInput] = useState(searchParams.get("id") ?? "");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const runVerification = useCallback(
    async (rawId: string, file: File | null) => {
      setError(null);
      setResult(null);

      const trimmedId = rawId.trim();
      if (!trimmedId && !file) {
        setError("Masukkan ID sertifikat, unggah berkas PDF, atau keduanya.");
        return;
      }
      if (trimmedId && !/^[1-9]\d*$/.test(trimmedId)) {
        setError("ID sertifikat harus berupa angka bulat positif.");
        return;
      }

      setIsChecking(true);
      try {
        const contract = getContractReadOnly(getReadProvider());
        const fileHash = file ? await computePdfHash(file) : null;

        // Without an id, the file hash itself tells us which certificate it belongs to.
        let id = trimmedId ? BigInt(trimmedId) : 0n;
        if (!trimmedId && fileHash) {
          id = await contract.certificateIdByFileHash(fileHash);
        }

        if (id === 0n) {
          setResult({ status: "not_found", cert: null, recipientName: null, issuerActive: true, fileChecked: !!file, fileHash });
          return;
        }

        let cert: CertificateData;
        try {
          cert = toCertificateData(Number(id), await contract.getCertificate(id));
        } catch (err: any) {
          if (err?.code === "CALL_EXCEPTION") {
            setResult({ status: "not_found", cert: null, recipientName: null, issuerActive: true, fileChecked: !!file, fileHash });
            return;
          }
          throw err;
        }

        // The contract's own verifyFile decides the file check, so the page never re-implements the rule.
        let status: VerifyStatus = cert.revoked ? "revoked" : "recorded";
        if (!cert.revoked && fileHash) {
          const matches: boolean = await contract.verifyFile(id, fileHash);
          status = matches ? "valid" : "hash_mismatch";
        }

        const [profile, issuerActive] = await Promise.all([
          api.getPublicProfile(cert.recipient),
          contract.hasRole(ISSUER_ROLE, cert.issuer) as Promise<boolean>,
        ]);
        setResult({ status, cert, recipientName: profile?.full_name ?? null, issuerActive, fileChecked: !!file, fileHash });

        router.replace(`/verify?id=${cert.id}`, { scroll: false });
      } catch (err) {
        console.error("Verification failed:", err);
        setError("Gagal membaca data dari jaringan Sepolia. Periksa koneksi internet lalu coba lagi.");
      } finally {
        setIsChecking(false);
      }
    },
    [router]
  );

  // A shared link or QR code opens this page with ?id=, so check it right away.
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) runVerification(id, null);
    // Only on first load; later checks are started by the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Berkas harus berformat PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("Ukuran berkas maksimal 5 MB.");
      return;
    }
    setError(null);
    setPdfFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runVerification(idInput, pdfFile);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
          <FileCheck2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Verifikasi Sertifikat</h1>
          <p className="text-sm text-slate-400">Tanpa login. Data dibaca langsung dari smart contract di Sepolia.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
        <div>
          <label htmlFor="cert-id" className="text-sm font-medium text-slate-200">
            ID sertifikat
          </label>
          <input
            id="cert-id"
            inputMode="numeric"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            placeholder="Contoh: 1"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div>
          <span className="text-sm font-medium text-slate-200">Berkas PDF yang Anda terima (opsional)</span>
          <p className="mt-1 text-xs text-slate-400">
            Hash SHA-256 berkas dihitung di browser Anda dan dicocokkan dengan hash di blockchain. Berkas tidak diunggah ke
            mana pun. Tanpa ID, sistem mencari sertifikat dari hash berkas ini.
          </p>
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} className="hidden" id="pdf-input" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label
              htmlFor="pdf-input"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 focus-within:ring-2 focus-within:ring-indigo-500/40"
            >
              <Upload className="h-4 w-4" />
              Pilih PDF
            </label>
            {pdfFile && (
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <span className="max-w-[16rem] truncate">{pdfFile.name}</span>
                <button
                  type="button"
                  onClick={() => setPdfFile(null)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
                >
                  Hapus
                </button>
              </span>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isChecking}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 sm:w-auto"
        >
          {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
          {isChecking ? "Memeriksa di Sepolia..." : "Periksa Keaslian"}
        </button>
      </form>

      {result && <ResultCard result={result} onCheckFile={() => fileInputRef.current?.click()} />}
    </div>
  );
}

const STATUS_STYLES: Record<VerifyStatus, { label: string; note: string; box: string; icon: React.ReactNode }> = {
  valid: {
    label: "Valid",
    note: "Berkas PDF yang Anda unggah cocok dengan catatan di blockchain, dan sertifikat belum dicabut.",
    box: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: <CheckCircle2 className="h-7 w-7" />,
  },
  recorded: {
    label: "Tercatat, Berkas Belum Diperiksa",
    note:
      "Sertifikat dengan ID ini ada di blockchain dan belum dicabut. Ini belum membuktikan bahwa PDF yang Anda terima adalah berkas aslinya: siapa pun bisa menempelkan ID sertifikat orang lain pada PDF palsu.",
    box: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    icon: <FileSearch className="h-7 w-7" />,
  },
  revoked: {
    label: "Dicabut",
    note: "Sertifikat ini pernah diterbitkan, tetapi sudah dicabut dan tidak berlaku lagi.",
    box: "border-red-500/40 bg-red-500/10 text-red-300",
    icon: <XCircle className="h-7 w-7" />,
  },
  hash_mismatch: {
    label: "Berkas Tidak Cocok",
    note: "Sertifikat ini ada di blockchain, tetapi berkas PDF yang Anda unggah berbeda dari berkas aslinya. Berkas kemungkinan sudah diubah.",
    box: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: <AlertTriangle className="h-7 w-7" />,
  },
  not_found: {
    label: "Tidak Ditemukan",
    note: "Tidak ada sertifikat dengan ID atau berkas tersebut di blockchain.",
    box: "border-slate-600 bg-slate-800/60 text-slate-300",
    icon: <SearchX className="h-7 w-7" />,
  },
};

function ResultCard({ result, onCheckFile }: { result: VerifyResult; onCheckFile: () => void }) {
  const style = STATUS_STYLES[result.status];
  const { cert } = result;

  return (
    <section aria-live="polite" className="mt-8 space-y-4">
      <div className={`flex items-start gap-4 rounded-2xl border p-5 ${style.box}`}>
        <span className="shrink-0">{style.icon}</span>
        <div>
          <p className="text-xl font-bold">{style.label}</p>
          <p className="mt-1 text-sm opacity-90">{style.note}</p>
          {result.status === "recorded" && (
            <button
              type="button"
              onClick={onCheckFile}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              <Upload className="h-4 w-4" />
              Unggah PDF untuk memeriksa keaslian
            </button>
          )}
        </div>
      </div>

      {cert && !cert.revoked && !result.issuerActive && (
        <p role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            Wallet penerbit sertifikat ini sudah tidak terdaftar sebagai Issuer aktif. Sertifikat yang terbit sebelum role
            dicabut tetap tercatat, tetapi bisa juga berasal dari wallet yang disalahgunakan. Konfirmasi ke pihak kampus
            sebelum menerimanya.
          </span>
        </p>
      )}

      {cert && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">{cert.title}</h2>
          <p className="text-sm text-slate-400">
            Sertifikat #{cert.id} &middot; {cert.certType}
          </p>

          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Detail label="Penerima">
              <AddressLink address={cert.recipient} />
              {result.recipientName && (
                <span className="mt-1 block text-xs text-slate-400">
                  Nama menurut profil pemilik wallet: <span className="text-slate-200">{result.recipientName}</span>
                  <span className="block text-slate-500">
                    Diisi sendiri oleh pemilik wallet, belum diverifikasi. Cocokkan dengan nama yang tertulis di PDF yang hash-nya
                    cocok.
                  </span>
                </span>
              )}
            </Detail>
            <Detail label="Penerbit">
              <AddressLink address={cert.issuer} />
            </Detail>
            <Detail label="Tanggal kegiatan">{formatDate(cert.eventDate)}</Detail>
            <Detail label="Diterbitkan">{formatDate(cert.issuedAt)}</Detail>
            {cert.revoked && (
              <>
                <Detail label="Dicabut pada">{formatDate(cert.revokedAt)}</Detail>
                <Detail label="Alasan pencabutan">{cert.revokeReason}</Detail>
              </>
            )}
            <div className="sm:col-span-2">
              <Detail label="Hash SHA-256 berkas di blockchain">
                <span className="break-all font-mono text-xs text-slate-300">{cert.fileHash}</span>
              </Detail>
            </div>
            {result.fileHash && result.status === "hash_mismatch" && (
              <div className="sm:col-span-2">
                <Detail label="Hash berkas yang Anda unggah">
                  <span className="break-all font-mono text-xs text-amber-300">{result.fileHash}</span>
                </Detail>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {ipfsUrl(cert.fileCID) ? (
              <a
                href={ipfsUrl(cert.fileCID)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500"
              >
                Lihat PDF di IPFS
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              <span className="inline-flex min-h-11 items-center rounded-xl border border-amber-500/30 px-4 py-2.5 text-sm text-amber-300">
                CID berkas di blockchain tidak valid, tautan IPFS tidak ditampilkan
              </span>
            )}
            <a
              href={`${EXPLORER_URL}/nft/${CONTRACT_ADDRESS}/${cert.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500"
            >
              Lihat token di Etherscan
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-200">{children}</dd>
    </div>
  );
}

function AddressLink({ address }: { address: string }) {
  const checksummed = ethers.getAddress(address);
  return (
    <a
      href={`${EXPLORER_URL}/address/${checksummed}`}
      target="_blank"
      rel="noopener noreferrer"
      title={checksummed}
      className="font-mono text-xs text-indigo-300 underline-offset-2 hover:underline"
    >
      {shortAddress(checksummed)}
    </a>
  );
}
