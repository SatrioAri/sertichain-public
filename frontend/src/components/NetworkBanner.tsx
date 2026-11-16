"use client";

import React from "react";
import { useWeb3 } from "../context/Web3Context";
import { AlertTriangle, PauseCircle, ArrowRight } from "lucide-react";

export function NetworkBanner() {
  const { account, chainId, isSepolia, isPaused, switchNetworkToSepolia } = useWeb3();

  if (!account) return null;

  return (
    <div className="w-full space-y-2 px-4 pt-3">
      {/* Wrong Network Warning Banner */}
      {!isSepolia && (
        <div className="mx-auto flex max-w-7xl items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-200 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <span className="font-semibold text-amber-300">Jaringan Tidak Sesuai:</span>{" "}
              Wallet Anda terhubung ke Chain ID {chainId || "Unknown"}. SertiChain berjalan di{" "}
              <span className="font-medium text-white">Ethereum Sepolia (Chain ID 11155111)</span>.
            </div>
          </div>
          <button
            onClick={switchNetworkToSepolia}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 active:scale-95"
          >
            Pindah ke Sepolia <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Contract Paused Emergency Notice */}
      {isPaused && (
        <div className="mx-auto flex max-w-7xl items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-red-200 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <PauseCircle className="h-5 w-5 shrink-0 text-red-400" />
            <div className="text-sm">
              <span className="font-semibold text-red-300">Status Darurat:</span> Smart Contract SertiChain sedang{" "}
              <span className="font-bold text-red-400">DIHENTIKAN SEMENTARA (PAUSED)</span> oleh Admin. Operasi penerbitan, pengubahan, dan pencabutan sertifikat dinonaktifkan sementara.
            </div>
          </div>
          <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 border border-red-500/30">
            Pausable Active
          </span>
        </div>
      )}
    </div>
  );
}
