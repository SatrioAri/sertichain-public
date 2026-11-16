import multer from "multer";
import { HttpError } from "../lib/http.js";

export function notFound(req, res) {
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
}

export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  // Errors from express.json() (malformed or oversized body) are safe to show.
  if (err.expose && err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan di server" });
}
