import { createHash } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { config } from "../config.js";
import { isPaused } from "../lib/contract.js";
import { HttpError } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const filesRouter = Router();

export const MAX_PDF_BYTES = 5 * 1024 * 1024;

const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const PDF_MAGIC = Buffer.from("%PDF-");

// The mimetype here is whatever the client claims; the handler still checks the %PDF- header.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

// Pinata quota is shared by the whole team, so each issuer wallet gets its own upload budget (audit BE-01).
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.user.wallet,
  message: { error: "Batas unggahan tercapai (20 berkas per jam). Coba lagi nanti." },
});

// A paused contract rejects every issuance, so a file uploaded now could never be used (audit BE-01).
async function rejectWhenPaused(req, res, next) {
  if (await isPaused()) {
    throw new HttpError(409, "Smart contract sedang di-pause. Penerbitan dan unggahan berkas ditutup sementara.");
  }
  next();
}

// Auth runs before multer so unauthenticated uploads are rejected before the body is read.
filesRouter.post("/", requireAuth, requireRole("issuer"), uploadLimiter, rejectWhenPaused, upload.single("file"), async (req, res) => {
  // 1. A file must be present (multer drops non-PDF mimetypes, which also lands here).
  if (!req.file) throw new HttpError(400, "File PDF wajib diunggah di field 'file'");

  // 2. The content itself must start with %PDF-; the mimetype can be faked.
  const buffer = req.file.buffer;
  if (buffer.length < PDF_MAGIC.length || !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new HttpError(400, "File bukan PDF yang valid");
  }

  // 3. Same format the contract and the frontend use: 0x + 64 hex chars.
  const fileHash = "0x" + createHash("sha256").update(buffer).digest("hex");

  if (!config.PINATA_JWT) {
    throw new Error("PINATA_JWT belum diisi di .env");
  }

  // 4. Upload to public IPFS through Pinata. The file is named by its hash so the uploader's
  //    original filename (which might contain personal data) is not published.
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), `${fileHash.slice(2)}.pdf`);
  form.append("network", "public");

  let pinataRes;
  try {
    pinataRes = await fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.PINATA_JWT}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("Pinata upload failed:", err);
    throw new HttpError(502, "Upload ke IPFS gagal");
  }

  if (!pinataRes.ok) {
    console.error("Pinata upload failed:", pinataRes.status, await pinataRes.text().catch(() => ""));
    throw new HttpError(502, "Upload ke IPFS gagal");
  }

  const cid = (await pinataRes.json())?.data?.cid;
  if (!cid) {
    console.error("Pinata response had no CID");
    throw new HttpError(502, "Upload ke IPFS gagal");
  }

  // 5. Done.
  res.json({ fileHash, cid });
});
