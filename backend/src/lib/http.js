export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notImplemented(req, res) {
  res.status(501).json({ error: `${req.method} ${req.baseUrl}${req.route.path} belum diimplementasikan` });
}
