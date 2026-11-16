import { Router } from "express";
import { SiweMessage, generateNonce } from "siwe";
import { config, siweDomain } from "../config.js";
import { HttpError } from "../lib/http.js";
import { signSession } from "../lib/session.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { nonceRequestSchema, verifyRequestSchema } from "../schemas.js";

export const authRouter = Router();

const NONCE_TTL_MS = 5 * 60 * 1000;

// F-01: issue a single-use nonce that expires in 5 minutes.
authRouter.post("/nonce", validateBody(nonceRequestSchema), async (req, res) => {
  const { address } = req.body;
  const now = new Date();

  // Housekeeping: drop this wallet's expired nonces so the table does not grow forever.
  await supabase.from("auth_nonces").delete().eq("wallet_address", address).lt("expires_at", now.toISOString());

  const nonce = generateNonce();
  const { error } = await supabase.from("auth_nonces").insert({
    nonce,
    wallet_address: address,
    expires_at: new Date(now.getTime() + NONCE_TTL_MS).toISOString(),
  });
  if (error) throw error;

  res.json({ nonce });
});

// F-01: verify the SIWE message, consume the nonce, return a session token.
// Every failure gets the same generic 401 so the response does not reveal which check failed.
authRouter.post("/verify", validateBody(verifyRequestSchema), async (req, res) => {
  const loginFailed = () => new HttpError(401, "Login gagal");
  const { message, signature } = req.body;

  // 1. Parse.
  let siweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    throw loginFailed();
  }

  // 2. Chain ID and the frontend origin must match ours.
  if (siweMessage.chainId !== config.CHAIN_ID) throw loginFailed();
  if (siweMessage.uri !== new URL(config.FRONTEND_ORIGIN).origin) throw loginFailed();

  const address = siweMessage.address.toLowerCase();

  // 3. The nonce must exist for this wallet, be unused, and not be expired.
  const { data: nonceRow, error: lookupError } = await supabase
    .from("auth_nonces")
    .select("nonce")
    .eq("nonce", siweMessage.nonce)
    .eq("wallet_address", address)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!nonceRow) throw loginFailed();

  // 4. Signature, domain and nonce.
  try {
    const { success } = await siweMessage.verify({ signature, domain: siweDomain, nonce: nonceRow.nonce });
    if (!success) throw loginFailed();
  } catch {
    throw loginFailed();
  }

  // 5. Mark the nonce used in a single conditional update. If no row changed, another request used it first.
  const { data: consumed, error: consumeError } = await supabase
    .from("auth_nonces")
    .update({ used: true })
    .eq("nonce", nonceRow.nonce)
    .eq("used", false)
    .select("nonce");
  if (consumeError) throw consumeError;
  if (!consumed || consumed.length !== 1) throw loginFailed();

  // 6. Session token.
  res.json({ token: signSession(address) });
});

// F-02 (option B): revoke this token's jti until it would have expired anyway.
authRouter.post("/logout", requireAuth, async (req, res) => {
  const { error } = await supabase
    .from("revoked_tokens")
    .upsert({ jti: req.user.jti, expires_at: new Date(req.user.exp * 1000).toISOString() }, { onConflict: "jti" });
  if (error) throw error;

  // Housekeeping: revoked tokens that are past their expiry are rejected by the JWT check anyway.
  await supabase.from("revoked_tokens").delete().lt("expires_at", new Date().toISOString());

  res.status(204).end();
});
