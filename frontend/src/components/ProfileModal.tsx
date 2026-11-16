"use client";

import React, { useState } from "react";
import { useWeb3 } from "../context/Web3Context";
import { api, UserProfile } from "../lib/api";
import {
  User,
  Mail,
  CreditCard,
  Image as ImageIcon,
  Save,
  Trash2,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ProfileModalContent({
  profile,
  account,
  refreshProfile,
  onClose,
}: {
  profile: UserProfile | null;
  account: string | null;
  refreshProfile: () => Promise<void>;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [studentId, setStudentId] = useState(profile?.student_id || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setMessage({ text: "Nama lengkap wajib diisi.", type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        full_name: fullName.trim(),
        student_id: studentId.trim() || undefined,
        email: email.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
      };

      if (profile) {
        // Update existing profile (PUT /users/me)
        await api.updateProfile(payload);
        setMessage({ text: "Profil berhasil diperbarui!", type: "success" });
      } else {
        // Create new profile (POST /users/me)
        await api.createProfile(payload);
        setMessage({ text: "Profil berhasil dibuat!", type: "success" });
      }

      await refreshProfile();
      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (err: any) {
      setMessage({ text: err.message || "Gagal menyimpan profil.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus profil off-chain Anda? Data tidak dapat dipulihkan.")) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      await api.deleteProfile();
      await refreshProfile();
      setFullName("");
      setStudentId("");
      setEmail("");
      setAvatarUrl("");
      setMessage({ text: "Profil Anda telah berhasil dihapus.", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Gagal menghapus profil.", type: "error" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Profil Pengguna Off-Chain</h3>
              <p className="text-xs text-slate-400 font-mono">
                {account ? `${account.slice(0, 8)}...${account.slice(-6)}` : "Wallet belum terhubung"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm border ${
              message.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
              <User className="h-3.5 w-3.5 text-blue-400" />
              Nama Lengkap <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: Rajen Alexander"
              required
              maxLength={100}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
              <CreditCard className="h-3.5 w-3.5 text-blue-400" />
              NIM / ID Pegawai (Opsional)
            </label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Contoh: 2602123456"
              maxLength={20}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
              <Mail className="h-3.5 w-3.5 text-blue-400" />
              Alamat Email (Opsional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@binus.ac.id"
              maxLength={100}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-300">
              <ImageIcon className="h-3.5 w-3.5 text-blue-400" />
              URL Avatar / Foto (Opsional, HTTPS)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/foto.jpg"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <p className="text-[11px] text-slate-400">
            * Data profil disimpan di database off-chain (PostgreSQL/Supabase) dan tidak pernah masuk ke smart contract Ethereum demi menjaga privasi dan menghemat gas.
          </p>

          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            {profile ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || loading}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Hapus Profil
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 active:scale-95"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={loading || deleting}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {profile ? "Simpan Perubahan" : "Buat Profil"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { account, profile, refreshProfile } = useWeb3();

  if (!isOpen) return null;

  return (
    <ProfileModalContent
      profile={profile}
      account={account}
      refreshProfile={refreshProfile}
      onClose={onClose}
    />
  );
}
