import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "../context/Web3Context";
import { Navbar } from "../components/Navbar";
import { NetworkBanner } from "../components/NetworkBanner";

export const metadata: Metadata = {
  title: "SertiChain - Platform Penerbitan & Verifikasi Sertifikat Kampus Soulbound (ERC-5192)",
  description:
    "dApp berbasis Ethereum Sepolia untuk menerbitkan dan memverifikasi sertifikat kegiatan kampus tanpa perantara dengan integritas kriptografis dan IPFS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#090d16] text-slate-100 selection:bg-blue-600 selection:text-white">
        <Web3Provider>
          <Navbar />
          <NetworkBanner />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-slate-800/60 bg-slate-950/40 py-6 text-center text-xs text-slate-500">
            <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p>
                © 2026 SertiChain • COMP6873001 Blockchain Fundamental • BINUS University
              </p>
              <p className="font-mono text-[11px] text-slate-400">
                Sepolia Contract:{" "}
                <a
                  href={`https://sepolia.etherscan.io/address/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x6cF38b6A9059477d39dC8230e5773Dcea793fDb4"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 underline underline-offset-2"
                >
                  {(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x6cF38b6A9059477d39dC8230e5773Dcea793fDb4").slice(0, 10)}...
                </a>
              </p>
            </div>
          </footer>
        </Web3Provider>
      </body>
    </html>
  );
}
