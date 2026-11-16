"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useWeb3 } from "../../context/Web3Context";
import {
  getContractReadOnly,
  getContractWithSigner,
  parseContractError,
  computePdfHash,
  CertificateData,
  getReadProvider,
  dateInputToTimestamp,
  timestampToDateInput,
  todayDateInput,
  readContractEventsSinceDeploy,
} from "../../lib/contract";
import { api } from "../../lib/api";
import { ethers } from "ethers";
import {
  Award,
  Upload,
  FileText,
  Calendar,
  User,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Edit3,
  Trash2,
  RefreshCw,
  Clock,
  FileSpreadsheet,
  FileCheck,
  X,
} from "lucide-react";

// Values accepted by the "Jenis Sertifikat" select; CSV rows must use one of these.
const CERT_TYPES = [
  { value: "Seminar", label: "Seminar / Kuliah Umum" },
  { value: "Workshop", label: "Workshop & Pelatihan" },
  { value: "Lomba", label: "Kompetisi / Lomba" },
  { value: "Kepanitiaan", label: "Kepanitiaan Organisasi" },
  { value: "Asisten Dosen", label: "Asisten Dosen / Lab" },
  { value: "Prestasi Akademik", label: "Prestasi Akademik" },
];

type CsvRow = { recipient: string; title: string; certType: string; eventDate: string; problem: string | null };

export default function IssuerDashboardPage() {
  const { account, role, isPaused, getSigner, connectWallet } = useWeb3();

  // Active Tab: Issue Form, My Certificates, CSV Bulk (F-15), Activity History (F-14)
  const [activeTab, setActiveTab] = useState<"issue" | "list" | "csv" | "history">("issue");

  // Form State (F-05)
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState("");
  const [certType, setCertType] = useState("Seminar");
  const [eventDate, setEventDate] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfHash, setPdfHash] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>("");

  // Success Modal State
  const [issuedSuccess, setIssuedSuccess] = useState<{
    id: number;
    recipient: string;
    title: string;
    fileHash: string;
    fileCID: string;
    txHash: string;
  } | null>(null);

  // Issuer's Certificates List State (F-06, F-07, F-08)
  const [certificates, setCertificates] = useState<CertificateData[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  // Edit Metadata Modal State (F-07)
  const [editingCert, setEditingCert] = useState<CertificateData | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCertType, setEditCertType] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [updatingCert, setUpdatingCert] = useState(false);

  // Revoke Modal State (F-08)
  const [revokingCert, setRevokingCert] = useState<CertificateData | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  // Activity History State (F-14)
  const [historyEvents, setHistoryEvents] = useState<
    { type: string; id: number; timestamp?: number; txHash: string; details: string }[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // CSV Bulk Issuance State (F-15)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  // Row currently loaded into the single-issue form, and rows already issued in this session.
  const [csvActiveRow, setCsvActiveRow] = useState<number | null>(null);
  const [csvIssuedRows, setCsvIssuedRows] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global Alert
  const [alert, setAlert] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showAlert = (message: string, type: "success" | "error") => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 6000);
  };

  // Handle PDF file selection and immediate hash computation
  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setPdfFile(null);
      setPdfHash(null);
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showAlert("Hanya berkas format PDF yang diizinkan.", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showAlert("Ukuran berkas PDF melebihi batas maksimal 5 MB.", "error");
      return;
    }

    // Verify first 5 bytes are '%PDF-'
    try {
      const buffer = await file.slice(0, 5).arrayBuffer();
      const header = new TextDecoder().decode(buffer);
      if (!header.startsWith("%PDF-")) {
        showAlert("Format berkas tidak valid: header PDF tidak terdeteksi.", "error");
        return;
      }
    } catch {
      showAlert("Gagal membaca struktur berkas PDF.", "error");
      return;
    }

    setPdfFile(file);
    try {
      const hash = await computePdfHash(file);
      setPdfHash(hash);
    } catch {
      showAlert("Gagal menghitung hash SHA-256 berkas.", "error");
    }
  };

  // Load Certificates issued by this Issuer
  const loadMyCertificates = useCallback(async () => {
    if (!account) return;
    setLoadingCerts(true);
    try {
      const signer = await getSigner();
      const provider = signer?.provider || getReadProvider();
      const contract = getContractReadOnly(provider);

      // Scan every id instead of a recent log window, so older certificates are not dropped.
      const total = Number(await contract.totalCertificates());
      const certIds = Array.from({ length: Math.min(total, 500) }, (_, i) => i + 1);

      const certPromises = certIds.map(async (id) => {
        try {
          const c = await contract.getCertificate(id);
          // Only return certificates originally issued by this account
          if (c.issuer.toLowerCase() === account.toLowerCase()) {
            return {
              id,
              issuer: c.issuer,
              recipient: c.recipient,
              title: c.title,
              certType: c.certType,
              eventDate: Number(c.eventDate),
              issuedAt: Number(c.issuedAt),
              fileHash: c.fileHash,
              fileCID: c.fileCID,
              revoked: c.revoked,
              revokeReason: c.revokeReason,
              revokedAt: Number(c.revokedAt),
            } as CertificateData;
          }
        } catch {
          return null;
        }
        return null;
      });

      const results = (await Promise.all(certPromises)).filter((c): c is CertificateData => c !== null);
      results.sort((a, b) => b.id - a.id);
      setCertificates(results);
    } catch (err) {
      console.error("Failed to load certificates:", err);
    } finally {
      setLoadingCerts(false);
    }
  }, [account, getSigner]);

  // Load Blockchain History Events (F-14)
  const loadHistory = useCallback(async () => {
    if (!account) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const me = account.toLowerCase();
      const eventNames = ["CertificateIssued", "CertificateUpdated", "CertificateRevoked"];

      const { events, provider } = await readContractEventsSinceDeploy(eventNames);

      // Revocations carry the revoker, not the issuer, so they are matched by the ids this wallet issued.
      const myIds = new Set(
        events
          .filter((ev) => ev.eventName === "CertificateIssued" && ev.args.issuer.toLowerCase() === me)
          .map((ev) => Number(ev.args.id))
      );

      const mine = events.filter((ev) => {
        if (ev.eventName === "CertificateRevoked") return myIds.has(Number(ev.args.id));
        return ev.args.issuer.toLowerCase() === me;
      });

      const blockTimes = new Map<number, number>();
      await Promise.all(
        [...new Set(mine.map((ev) => ev.blockNumber))].map(async (n) => {
          const block = await provider.getBlock(n);
          if (block) blockTimes.set(n, block.timestamp);
        })
      );

      mine.sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index);

      setHistoryEvents(
        mine.map((ev) => {
          const id = Number(ev.args.id);
          const base = { id, txHash: ev.transactionHash, timestamp: blockTimes.get(ev.blockNumber) };
          if (ev.eventName === "CertificateIssued") {
            const to = ev.args.recipient as string;
            return { ...base, type: "PENERBITAN", details: `Penerbitan sertifikat #${id} untuk ${to.slice(0, 6)}...${to.slice(-4)}` };
          }
          if (ev.eventName === "CertificateUpdated") {
            return { ...base, type: "PEMBARUAN", details: `Pembaruan metadata sertifikat #${id}` };
          }
          return { ...base, type: "PENCABUTAN", details: `Pencabutan sertifikat #${id}: ${ev.args.reason}` };
        })
      );
    } catch (err) {
      console.warn("Failed to load activity history:", err);
      setHistoryError("Gagal membaca event dari jaringan Sepolia. Coba klik Segarkan beberapa saat lagi.");
    } finally {
      setLoadingHistory(false);
    }
  }, [account]);

  useEffect(() => {
    if (role === "issuer") {
      loadMyCertificates();
      loadHistory();
    }
  }, [role, loadMyCertificates, loadHistory]);

  // 1. Submit Single Certificate Form (F-05)
  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPaused) {
      showAlert("Smart contract sedang dihentikan sementara (PAUSED). Penerbitan tidak dapat dilakukan.", "error");
      return;
    }

    if (!ethers.isAddress(recipient)) {
      showAlert("Alamat wallet penerima tidak valid.", "error");
      return;
    }

    if (account && recipient.toLowerCase() === account.toLowerCase()) {
      showAlert("SelfIssuance: Anda dilarang menerbitkan sertifikat untuk diri sendiri.", "error");
      return;
    }

    if (!title.trim() || !certType.trim()) {
      showAlert("Nama kegiatan dan jenis sertifikat tidak boleh kosong.", "error");
      return;
    }

    if (!eventDate) {
      showAlert("Tanggal kegiatan wajib dipilih.", "error");
      return;
    }

    const eventDateTimestamp = dateInputToTimestamp(eventDate);
    const nowTimestamp = Math.floor(Date.now() / 1000);
    if (eventDateTimestamp > nowTimestamp) {
      showAlert("Tanggal kegiatan tidak boleh berada di masa depan.", "error");
      return;
    }

    if (!pdfFile || !pdfHash) {
      showAlert("Silakan unggah berkas PDF sertifikat terlebih dahulu.", "error");
      return;
    }

    setIsSubmitting(true);
    setSubmitStep("Memeriksa duplikasi hash di blockchain...");

    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap atau terputus.");

      const contract = getContractWithSigner(signer);

      // Pre-check duplicate file hash on Sepolia smart contract
      const existingId = await contract.certificateIdByFileHash(pdfHash);
      if (BigInt(existingId) > BigInt(0)) {
        throw new Error(`DuplicateFileHash: Berkas PDF ini sudah pernah didaftarkan pada Sertifikat ID #${existingId.toString()}.`);
      }

      // Step 2: Upload PDF to IPFS via backend endpoint POST /files
      setSubmitStep("Mengunggah berkas PDF ke IPFS (Pinata)...");
      const { cid, fileHash: backendHash } = await api.uploadCertificatePdf(pdfFile);
      if (cid.startsWith("mock-")) {
        throw new Error("Mode mock aktif (NEXT_PUBLIC_USE_MOCK_API=true): berkas tidak benar-benar diunggah ke IPFS, jadi sertifikat tidak diterbitkan.");
      }
      if (backendHash.toLowerCase() !== pdfHash.toLowerCase()) {
        throw new Error("Hash dari backend berbeda dengan hash yang dihitung di browser. Penerbitan dibatalkan.");
      }

      // Step 3: Send blockchain transaction via MetaMask
      setSubmitStep("Menunggu konfirmasi tanda tangan transaksi di MetaMask...");
      const formattedRecipient = ethers.getAddress(recipient.trim());
      const tx = await contract.issueCertificate(
        formattedRecipient,
        title.trim(),
        certType.trim(),
        eventDateTimestamp,
        pdfHash,
        cid
      );

      setSubmitStep(`Transaksi dikirim (${tx.hash.slice(0, 10)}...). Menunggu blok Sepolia terkonfirmasi...`);
      const receipt = await tx.wait();

      // Step 4: Parse CertificateIssued event
      let issuedId = 0;
      for (const log of receipt.logs) {
        try {
          const parsedLog = contract.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "CertificateIssued") {
            issuedId = Number(parsedLog.args[0]);
            break;
          }
        } catch {
          // Log not from our interface
        }
      }

      // Show success modal
      setIssuedSuccess({
        id: issuedId || 1,
        recipient,
        title,
        fileHash: pdfHash,
        fileCID: cid,
        txHash: tx.hash,
      });

      // Only count the CSV row as done if the form still holds that row's recipient.
      if (csvActiveRow !== null && csvRows[csvActiveRow]?.recipient.toLowerCase() === recipient.toLowerCase()) {
        const done = csvActiveRow;
        setCsvIssuedRows((prev) => new Set(prev).add(done));
        setCsvActiveRow(null);
      }

      // Reset form
      setRecipient("");
      setTitle("");
      setCertType("Seminar");
      setEventDate("");
      setPdfFile(null);
      setPdfHash(null);

      await loadMyCertificates();
      await loadHistory();
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setIsSubmitting(false);
      setSubmitStep("");
    }
  };

  // 2. Open Edit Metadata Modal (F-07)
  const openEditModal = (cert: CertificateData) => {
    setEditingCert(cert);
    setEditTitle(cert.title);
    setEditCertType(cert.certType);
    setEditEventDate(timestampToDateInput(cert.eventDate));
  };

  // Submit Edit Metadata (F-07)
  const handleUpdateCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCert) return;

    if (!editTitle.trim() || !editCertType.trim()) {
      showAlert("Judul dan tipe sertifikat tidak boleh kosong.", "error");
      return;
    }

    const editTimestamp = dateInputToTimestamp(editEventDate);
    if (editTimestamp > Math.floor(Date.now() / 1000)) {
      showAlert("Tanggal kegiatan tidak boleh berada di masa depan.", "error");
      return;
    }

    setUpdatingCert(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap.");

      const contract = getContractWithSigner(signer);
      const tx = await contract.updateCertificate(
        editingCert.id,
        editTitle.trim(),
        editCertType.trim(),
        editTimestamp
      );

      showAlert(`Transaksi pembaruan dikirim. Menunggu konfirmasi...`, "success");
      await tx.wait();
      showAlert(`Metadata sertifikat #${editingCert.id} berhasil diperbarui!`, "success");

      setEditingCert(null);
      await loadMyCertificates();
      await loadHistory();
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setUpdatingCert(false);
    }
  };

  // 3. Open Revoke Modal (F-08)
  const openRevokeModal = (cert: CertificateData) => {
    setRevokingCert(cert);
    setRevokeReason("");
  };

  // Submit Revoke Certificate (F-08)
  const handleRevokeCertificate = async () => {
    if (!revokingCert) return;
    if (!revokeReason.trim()) {
      showAlert("Alasan pencabutan sertifikat wajib diisi.", "error");
      return;
    }

    setIsRevoking(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Wallet belum siap.");

      const contract = getContractWithSigner(signer);
      const tx = await contract.revokeCertificate(revokingCert.id, revokeReason.trim());

      showAlert(`Transaksi pencabutan dikirim. Menunggu konfirmasi...`, "success");
      await tx.wait();
      showAlert(`Sertifikat #${revokingCert.id} berhasil dicabut.`, "success");

      setRevokingCert(null);
      await loadMyCertificates();
      await loadHistory();
    } catch (err: any) {
      showAlert(parseContractError(err), "error");
    } finally {
      setIsRevoking(false);
    }
  };

  // 4. CSV Bulk Preview (F-15)
  // Every row is checked against the same rules as the single-issue form, so a row marked valid can be issued as-is.
  const validateCsvRow = (row: Omit<CsvRow, "problem">): string | null => {
    if (!ethers.isAddress(row.recipient)) return "Wallet tidak valid";
    if (account && row.recipient.toLowerCase() === account.toLowerCase()) return "Wallet sendiri";
    if (!row.title) return "Judul kosong";
    if (row.title.length > 200) return "Judul terlalu panjang";
    if (!CERT_TYPES.some((t) => t.value === row.certType)) return "Jenis tidak dikenal";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.eventDate) || Number.isNaN(dateInputToTimestamp(row.eventDate))) {
      return "Tanggal harus YYYY-MM-DD";
    }
    if (row.eventDate > todayDateInput()) return "Tanggal di masa depan";
    return null;
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so choosing the same file again still triggers onChange.
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        showAlert("Berkas CSV kosong.", "error");
        return;
      }

      // Skip header if line 0 is recipient,title,certType,eventDate
      const startIndex = lines[0].toLowerCase().includes("recipient") ? 1 : 0;
      const rows: CsvRow[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim());
        if (parts.length < 4) continue;
        const row = { recipient: parts[0], title: parts[1], certType: parts[2], eventDate: parts[3] };
        rows.push({ ...row, problem: validateCsvRow(row) });
      }
      setCsvRows(rows);
      setCsvActiveRow(null);
      setCsvIssuedRows(new Set());
      const validCount = rows.filter((r) => !r.problem).length;
      showAlert(`Berhasil memuat ${rows.length} baris (${validCount} valid) dari berkas CSV.`, "success");
    };
    reader.readAsText(file);
  };

  // Copies one CSV row into the single-issue form. The issuer still picks that row's PDF and signs the transaction.
  const fillFormFromCsv = (index: number) => {
    const row = csvRows[index];
    setRecipient(row.recipient);
    setTitle(row.title);
    setCertType(row.certType);
    setEventDate(row.eventDate);
    handleFileChange(null);
    setCsvActiveRow(index);
    setActiveTab("issue");
    window.scrollTo({ top: 0, behavior: "smooth" });
    showAlert(`Baris ${index + 1} dimuat ke formulir. Pilih berkas PDF untuk sertifikat ini, lalu klik Terbitkan.`, "success");
  };

  // Access Control Guard
  if (!account) {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Award className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-white">Dashboard Khusus Issuer</h2>
        <p className="mt-2 text-sm text-slate-400">
          Silakan hubungkan wallet MetaMask yang telah didaftarkan oleh Admin dengan role <span className="font-mono text-emerald-400">ISSUER_ROLE</span>.
        </p>
        <button
          onClick={connectWallet}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-500 transition active:scale-95"
        >
          Hubungkan Wallet Issuer
        </button>
      </div>
    );
  }

  if (role !== "issuer") {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-amber-300">Akses Ditolak: Belum Terdaftar Sebagai Issuer</h2>
        <p className="mt-2 text-sm text-slate-400">
          Wallet Anda (<span className="font-mono text-slate-300">{account.slice(0, 10)}...</span>) belum terdaftar dengan hak penerbitan di smart contract Sepolia.
        </p>
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 text-left">
          <p className="font-semibold text-slate-300 mb-1">Cara Mendapatkan Izin Issuer:</p>
          <p>
            Hubungi Admin kampus untuk menambahkan alamat wallet Anda ke smart contract melalui fungsi <span className="font-mono text-blue-400">addIssuer(address)</span> di Dashboard Admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Award className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Issuer</h1>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              ISSUER_ROLE
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Terbitkan sertifikat soulbound resmi, unggah PDF ke IPFS, serta kelola metadata sertifikat terbitan Anda.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Sertifikat Diterbitkan: <strong className="text-white font-mono text-sm">{certificates.length}</strong>
          </span>
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
          onClick={() => setActiveTab("issue")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "issue"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <FileCheck className="h-4 w-4" />
          Formulir Penerbitan (F-05)
        </button>

        <button
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "list"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <Award className="h-4 w-4" />
          Sertifikat Terbitan Saya ({certificates.length})
        </button>

        <button
          onClick={() => setActiveTab("csv")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "csv"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Penerbitan Massal CSV (F-15)
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "history"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:bg-slate-900 hover:text-white"
          }`}
        >
          <Clock className="h-4 w-4" />
          Riwayat Event Blockchain (F-14)
        </button>
      </div>

      {/* TAB 1: FORMULIR PENERBITAN (F-05) */}
      {activeTab === "issue" && (
        <div className="mt-6 max-w-3xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-emerald-400" />
              Penerbitan Sertifikat Baru (Soulbound ERC-5192)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Isi data sertifikat dengan teliti. Nilai hash berkas PDF akan dicatat ke smart contract Sepolia dan berkas diunggah ke jaringan IPFS.
            </p>

            <form onSubmit={handleIssueSubmit} className="mt-6 space-y-5">
              {/* Recipient Wallet */}
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
                  <User className="h-3.5 w-3.5 text-emerald-400" />
                  Alamat Wallet Penerima (Holder) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Tidak boleh alamat nol (0x0) dan tidak boleh alamat wallet Issuer sendiri.
                </span>
              </div>

              {/* Title / Activity Name */}
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
                  <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  Nama Kegiatan / Judul Sertifikat <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Juara 1 Hackathon Blockchain Innovation 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Cert Type & Event Date in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Award className="h-3.5 w-3.5 text-emerald-400" />
                    Jenis Sertifikat <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={certType}
                    onChange={(e) => setCertType(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {CERT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                    Tanggal Kegiatan <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    max={todayDateInput()}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* PDF File Upload */}
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Upload className="h-3.5 w-3.5 text-emerald-400" />
                  Berkas Sertifikat PDF (Maksimal 5 MB) <span className="text-red-400">*</span>
                </label>
                <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-6 text-center hover:border-emerald-500/60 transition">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                    id="pdf-upload-input"
                  />
                  <label
                    htmlFor="pdf-upload-input"
                    className="cursor-pointer flex flex-col items-center justify-center gap-2"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <FileText className="h-6 w-6" />
                    </div>
                    {pdfFile ? (
                      <div>
                        <p className="text-sm font-semibold text-white">{pdfFile.name}</p>
                        <p className="text-xs text-slate-400">
                          {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB • PDF Valid
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          Klik untuk memilih berkas atau seret PDF ke sini
                        </p>
                        <p className="text-xs text-slate-500">Hanya format .PDF yang didukung</p>
                      </div>
                    )}
                  </label>
                </div>

                {pdfHash && (
                  <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                    <span className="font-semibold text-slate-400">Kalkulasi SHA-256 Hash di Browser:</span>
                    <p className="mt-0.5 font-mono text-emerald-400 break-all">{pdfHash}</p>
                  </div>
                )}
              </div>

              {/* Progress Indicator */}
              {isSubmitting && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200 flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-300">Memproses Penerbitan:</p>
                    <p className="text-emerald-200">{submitStep}</p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isPaused}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-emerald-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sedang Menerbitkan...</span>
                    </>
                  ) : (
                    <>
                      <Award className="h-4 w-4" />
                      <span>Terbitkan Sertifikat ke Sepolia</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: DAFTAR SERTIFIKAT TERBITAN SAYA (F-06, F-07, F-08) */}
      {activeTab === "list" && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-400" />
                Sertifikat Terbitan Wallet Anda
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Sebagai penerbit, Anda berhak memperbarui metadata (salah ketik) atau mencabut sertifikat jika diperlukan.
              </p>
            </div>
            <button
              onClick={loadMyCertificates}
              disabled={loadingCerts}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingCerts ? "animate-spin" : ""}`} />
              Segarkan
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-800/60">
            {loadingCerts ? (
              <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Membaca sertifikat dari Ethereum Sepolia...
              </div>
            ) : certificates.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                Belum ada sertifikat yang pernah diterbitkan oleh wallet ini.
              </p>
            ) : (
              certificates.map((cert) => (
                <div key={cert.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-white">#{cert.id}</span>
                      <h3 className="font-semibold text-white text-sm">{cert.title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                          cert.revoked
                            ? "border-red-500/40 bg-red-500/10 text-red-300"
                            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {cert.revoked ? "DICABUT" : "AKTIF"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>Kategori: <strong className="text-slate-300">{cert.certType}</strong></span>
                      <span>Penerima: <span className="font-mono text-slate-300">{cert.recipient.slice(0, 8)}...{cert.recipient.slice(-6)}</span></span>
                      <span>Tanggal: <span className="text-slate-300">{new Date(cert.eventDate * 1000).toLocaleDateString("id-ID")}</span></span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono">
                      CID: <span className="text-blue-400 break-all">{cert.fileCID}</span>
                    </div>

                    {cert.revoked && (
                      <p className="text-xs text-red-400 italic">
                        Alasan Pencabutan: &ldquo;{cert.revokeReason}&rdquo;
                      </p>
                    )}
                  </div>

                  {!cert.revoked && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEditModal(cert)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-blue-500/40 hover:text-blue-300 transition"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Metadata
                      </button>

                      <button
                        onClick={() => openRevokeModal(cert)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Cabut
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PENERBITAN MASSAL DARI CSV (F-15) */}
      {activeTab === "csv" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              Penerbitan Massal dari Berkas CSV (F-15)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Unggah berkas CSV berisi daftar penerima. Setiap baris divalidasi, lalu klik <span className="font-semibold text-slate-300">Isi formulir</span> untuk
              memuatnya ke Formulir Penerbitan. Karena setiap sertifikat membutuhkan berkas PDF dan tanda tangan MetaMask sendiri, penerbitan dilakukan satu per satu.
            </p>

            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
                id="csv-file-input"
              />
              <label
                htmlFor="csv-file-input"
                className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition"
              >
                <Upload className="h-4 w-4" />
                Pilih Berkas CSV
              </label>

              <button
                type="button"
                onClick={() => {
                  const sampleCsv = `recipient,title,certType,eventDate\n0x1234567890abcdef1234567890abcdef12345678,Web3 Workshop,Workshop,2026-10-10\n0xabcdef1234567890abcdef1234567890abcdef12,Smart Contract Seminar,Seminar,2026-10-12`;
                  const blob = new Blob([sampleCsv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "template_sertichain.csv";
                  a.click();
                }}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Unduh Format Contoh CSV
              </button>
            </div>

            {/* CSV Table Preview */}
            {csvRows.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Alamat Wallet</th>
                      <th className="py-2.5 px-3">Judul Kegiatan</th>
                      <th className="py-2.5 px-3">Jenis</th>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Status Validasi</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {csvRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{i + 1}</td>
                        <td className="py-2.5 px-3 font-mono text-white">{r.recipient}</td>
                        <td className="py-2.5 px-3 text-slate-300">{r.title}</td>
                        <td className="py-2.5 px-3 text-slate-400">{r.certType}</td>
                        <td className="py-2.5 px-3 text-slate-400">{r.eventDate}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              r.problem ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {r.problem ?? "Format Valid"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {csvIssuedRows.has(i) ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Diterbitkan
                            </span>
                          ) : !r.problem ? (
                            <button
                              type="button"
                              onClick={() => fillFormFromCsv(i)}
                              className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                                csvActiveRow === i
                                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                  : "bg-emerald-600 text-white hover:bg-emerald-500"
                              }`}
                            >
                              <Award className="h-3.5 w-3.5" />
                              {csvActiveRow === i ? "Sedang diisi" : "Isi formulir"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RIWAYAT EVENT BLOCKCHAIN (F-14) */}
      {activeTab === "history" && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                Riwayat Aktivitas Blockchain (F-14)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Log audit terdesentralisasi dibaca langsung dari event <span className="font-mono">CertificateIssued</span>, <span className="font-mono">CertificateUpdated</span>, dan <span className="font-mono">CertificateRevoked</span> di Sepolia sejak kontrak di-deploy.
              </p>
            </div>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
              Segarkan
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-800/60">
            {loadingHistory ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Memuat riwayat event dari blockchain...
              </div>
            ) : historyError ? (
              <p role="alert" className="py-8 text-center text-xs text-red-400">
                {historyError}
              </p>
            ) : historyEvents.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Belum ada riwayat aktivitas tercatat untuk wallet ini.
              </p>
            ) : (
              historyEvents.map((item) => (
                <div key={`${item.txHash}-${item.type}-${item.id}`} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.type === "PENERBITAN"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : item.type === "PENCABUTAN"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-white font-medium">{item.details}</span>
                    {item.timestamp && (
                      <span className="text-slate-500">
                        {new Date(item.timestamp * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                  </div>

                  <a
                    href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-slate-400 hover:text-blue-400 transition"
                  >
                    Tx: {item.txHash.slice(0, 10)}...
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: SUCCESS MODAL AFTER ISSUANCE */}
      {issuedSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-emerald-500/40 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sertifikat Berhasil Diterbitkan!</h3>
                  <p className="text-xs text-slate-400">Token Soulbound resmi tercatat di Sepolia</p>
                </div>
              </div>
              <button
                onClick={() => setIssuedSuccess(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">ID Sertifikat (Token ID):</span>
                  <span className="font-mono font-bold text-white text-sm">#{issuedSuccess.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Judul Kegiatan:</span>
                  <span className="font-semibold text-slate-200">{issuedSuccess.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Wallet Penerima:</span>
                  <span className="font-mono text-slate-300">{issuedSuccess.recipient}</span>
                </div>
                <div className="border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">IPFS CID:</span>
                  <p className="font-mono text-blue-400 break-all">{issuedSuccess.fileCID}</p>
                </div>
                <div className="border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">File Hash SHA-256:</span>
                  <p className="font-mono text-slate-300 break-all">{issuedSuccess.fileHash}</p>
                </div>
              </div>

              <a
                href={`https://sepolia.etherscan.io/tx/${issuedSuccess.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:text-white transition"
              >
                Lihat Transaksi di Sepolia Etherscan <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setIssuedSuccess(null)}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-500 transition"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT METADATA (F-07) */}
      {editingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-400" />
                Edit Metadata Sertifikat #{editingCert.id}
              </h3>
              <button
                onClick={() => setEditingCert(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCertificate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Kegiatan (Title)</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Jenis Sertifikat</label>
                <input
                  type="text"
                  value={editCertType}
                  onChange={(e) => setEditCertType(e.target.value)}
                  maxLength={200}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tanggal Kegiatan</label>
                <input
                  type="date"
                  value={editEventDate}
                  onChange={(e) => setEditEventDate(e.target.value)}
                  max={todayDateInput()}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <p className="text-[11px] text-slate-400">
                * Sesuai arsitektur contract, Anda tidak dapat mengubah alamat penerima, hash, atau IPFS CID berkas.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCert(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updatingCert}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {updatingCert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REVOKE CERTIFICATE (F-08) */}
      {revokingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-red-500/40 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-red-300 flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-400" />
                Cabut Sertifikat #{revokingCert.id}
              </h3>
              <button
                onClick={() => setRevokingCert(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-300">
                Pencabutan sertifikat bersifat permanen di blockchain. Sertifikat akan ditandai berstatus <strong className="text-red-400">DICABUT</strong> dan tidak lagi valid saat diverifikasi siapapun.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Alasan Pencabutan <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Jelaskan alasan pencabutan (misal: diskualifikasi peserta atau pembatalan)"
                  maxLength={200}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRevokingCert(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleRevokeCertificate}
                  disabled={isRevoking || !revokeReason.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Konfirmasi Pencabutan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
