import { ethers } from "ethers";
import SertiChainArtifact from "../contracts/SertiChain.json";

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x6cF38b6A9059477d39dC8230e5773Dcea793fDb4";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ISSUER_ROLE"));

export const CONTRACT_ABI = SertiChainArtifact.abi;

export interface CertificateData {
  id: number;
  issuer: string;
  recipient: string;
  title: string;
  certType: string;
  eventDate: number; // Unix timestamp in seconds
  issuedAt: number;
  fileHash: string;
  fileCID: string;
  revoked: boolean;
  revokeReason: string;
  revokedAt: number;
}

// rpc.sepolia.org is no longer reliable, so the fallback is a public endpoint that still answers.
export const READ_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://sepolia.etherscan.io";

// Block that holds the deployment tx (see contracts/ignition/deployments/chain-11155111/journal.jsonl).
// Event scans start here instead of a fixed "last N blocks" window, so old activity is never dropped.
export const DEPLOY_BLOCK = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 11898310);

// Public RPCs reject eth_getLogs over very large ranges, so scans are split into chunks of this size.
const LOG_CHUNK_SIZE = 10_000;

// Fetches every log of the given event names emitted by the contract since deployment.
export async function queryContractEvents(
  contract: ethers.Contract,
  provider: ethers.Provider,
  eventNames: string[]
): Promise<ethers.EventLog[]> {
  const topics = eventNames.map((name) => contract.interface.getEvent(name)!.topicHash);
  const address = await contract.getAddress();
  const head = await provider.getBlockNumber();
  const logs: ethers.Log[] = [];
  for (let from = DEPLOY_BLOCK; from <= head; from += LOG_CHUNK_SIZE) {
    const to = Math.min(from + LOG_CHUNK_SIZE - 1, head);
    logs.push(...(await provider.getLogs({ address, topics: [topics], fromBlock: from, toBlock: to })));
  }
  return logs.map((log) => {
    const parsed = contract.interface.parseLog(log)!;
    return new ethers.EventLog(log, contract.interface, parsed.fragment);
  });
}

// Same scan, but picks a provider that can serve old logs. The public RPC prunes old history
// ("pruned history unavailable"), so MetaMask's RPC is tried first and the public RPC is only a fallback.
// Returns the provider that answered so callers can read block timestamps from the same node.
export async function readContractEventsSinceDeploy(
  eventNames: string[]
): Promise<{ events: ethers.EventLog[]; provider: ethers.Provider }> {
  const providers: ethers.Provider[] = [];
  const ethereum = typeof window !== "undefined" ? (window as any).ethereum : undefined;
  if (ethereum) providers.push(new ethers.BrowserProvider(ethereum));
  providers.push(getReadProvider());

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      // A wallet on another chain would answer with that chain's (empty) logs, which would look like no history.
      if (Number((await provider.getNetwork()).chainId) !== SEPOLIA_CHAIN_ID) throw new Error("Bukan jaringan Sepolia");
      const events = await queryContractEvents(getContractReadOnly(provider), provider, eventNames);
      return { events, provider };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Read-only provider for pages that must work without MetaMask (public verification).
export function getReadProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(READ_RPC_URL, SEPOLIA_CHAIN_ID, { staticNetwork: true });
}

// CIDv0 (Qm + 44 base58 chars) or CIDv1 in base32 (b + lowercase a-z2-7). The contract only checks the
// length of fileCID, so anything else (paths, "?", "#", "..") must never be turned into a link (audit SC-10).
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;

export function isValidCid(cid: string): boolean {
  return CID_PATTERN.test(cid);
}

// Returns null when the stored CID is not a real CID, so callers hide the link instead of pointing it elsewhere.
export function ipfsUrl(cid: string): string | null {
  if (!isValidCid(cid)) return null;
  return `${IPFS_GATEWAY}/${cid}`;
}

export function toCertificateData(id: number, c: any): CertificateData {
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
  };
}

// <input type="date"> gives "YYYY-MM-DD". Parse it as local midnight, not UTC midnight,
// so a same-day event in UTC+7 is not rejected as "in the future".
export function dateInputToTimestamp(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000);
}

function toLocalDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timestampToDateInput(timestamp: number): string {
  return toLocalDateInput(new Date(timestamp * 1000));
}

export function todayDateInput(): string {
  return toLocalDateInput(new Date());
}

export function getContractReadOnly(
  provider: ethers.Provider | ethers.Signer
): ethers.Contract {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

export function getContractWithSigner(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

/**
 * Decodes contract custom errors into friendly human-readable Indonesian messages
 */
export function parseContractError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Terjadi kesalahan yang tidak diketahui.";
  }

  const err = error as {
    code?: string | number;
    data?: string;
    info?: { error?: { data?: string } };
    message?: string;
    reason?: string;
  };

  // User rejection in MetaMask
  if (err.code === "ACTION_REJECTED" || err.code === 4001) {
    return "Transaksi dibatalkan oleh pengguna di MetaMask.";
  }

  // Try decoding custom error via ethers interface
  const contractInterface = new ethers.Interface(CONTRACT_ABI);
  const data = err.data || err.info?.error?.data;

  if (data) {
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed) {
        switch (parsed.name) {
          case "AdminCannotBeIssuer":
            return "Pemisahan Wewenang: Wallet Admin dilarang menjadi Issuer, dan sebaliknya.";
          case "SelfIssuance":
            return "Issuer tidak boleh menerbitkan sertifikat untuk alamat wallet sendiri.";
          case "DuplicateFileHash":
            return `Sertifikat dengan berkas PDF ini sudah terdaftar sebelumnya (ID: ${parsed.args[0]}).`;
          case "EmptyFileHash":
            return "Hash berkas PDF tidak boleh kosong.";
          case "InvalidEventDate":
            return "Tanggal kegiatan tidak valid atau tidak boleh di masa depan.";
          case "EmptyField":
            return `Kolom ${parsed.args[0]} tidak boleh kosong.`;
          case "TextTooLong":
            return `Panjang teks pada kolom ${parsed.args[0]} melebihi batas yang diizinkan.`;
          case "CertificateNotFound":
            return `Sertifikat dengan ID #${parsed.args[0]} tidak ditemukan.`;
          case "CertificateAlreadyRevoked":
            return `Sertifikat dengan ID #${parsed.args[0]} sudah pernah dicabut sebelumnya.`;
          case "NotCertificateIssuer":
            return "Akses ditolak: Anda bukan penerbit asli dari sertifikat ini.";
          case "NotAllowedToRevoke":
            return "Akses ditolak: Anda tidak memiliki hak untuk mencabut sertifikat ini.";
          case "EnforcedPause":
            return "Smart contract sedang dalam status dihentikan sementara (PAUSED) oleh Admin.";
          case "AccessControlUnauthorizedAccount":
            return "Wallet Anda tidak memiliki hak akses (role) yang dibutuhkan untuk fungsi ini.";
          case "Soulbound":
            return "Token sertifikat bersifat soulbound (tidak dapat dipindahtangankan).";
          case "ZeroAddress":
            return "Alamat wallet penerima tidak boleh alamat nol (0x0).";
          default:
            return `Error Kontrak: ${parsed.name}`;
        }
      }
    } catch {
      // Ignored if parsing fails
    }
  }

  if (err.reason) {
    return err.reason;
  }

  if (err.message) {
    if (err.message.includes("user rejected action")) {
      return "Transaksi dibatalkan oleh pengguna di MetaMask.";
    }
    if (err.message.includes("insufficient funds")) {
      return "Saldo Sepolia ETH Anda tidak mencukupi untuk membayar biaya gas.";
    }
    if (err.message.includes("AdminCannotBeIssuer")) {
      return "Pemisahan Wewenang: Wallet Admin dilarang menjadi Issuer, dan sebaliknya.";
    }
    if (err.message.includes("EnforcedPause")) {
      return "Smart contract sedang dalam status dihentikan sementara (PAUSED) oleh Admin.";
    }
    return err.message;
  }

  return "Terjadi kesalahan saat memproses transaksi.";
}

/**
 * Computes SHA-256 hash of a file as 0x-prefixed 64-character hex string
 */
export async function computePdfHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return ethers.sha256(uint8Array);
}
