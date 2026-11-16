import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { filesRouter } from "./routes/files.js";
import { publicRouter } from "./routes/public.js";
import { usersRouter } from "./routes/users.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.FRONTEND_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "20kb" }));

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  const limiter = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false });

  // Every route gets a broad per-IP ceiling; the routes below add tighter limits where abuse is cheap.
  app.use(limiter(15 * 60 * 1000, 300));

  // Login is limited on its own, so spending the login quota can no longer block /auth/logout (audit BE-04).
  app.use(["/auth/nonce", "/auth/verify"], limiter(15 * 60 * 1000, 30));
  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/admin", adminRouter);
  // Public profiles need no login, so they are throttled to make bulk wallet-to-name scraping slow (audit DS-02).
  app.use("/public", limiter(60 * 1000, 20), publicRouter);
  app.use("/files", filesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
