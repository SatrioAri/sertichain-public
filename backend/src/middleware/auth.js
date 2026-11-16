import { isAdmin, isIssuer } from "../lib/contract.js";
import { HttpError } from "../lib/http.js";
import { verifySession } from "../lib/session.js";
import { supabase } from "../lib/supabase.js";

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Token tidak ada");
  }

  let payload;
  try {
    payload = verifySession(token);
  } catch {
    throw new HttpError(401, "Token tidak valid atau sudah kedaluwarsa");
  }

  // Logout (option B): a token whose jti was revoked is rejected even before it expires.
  const {data: revoked, error} = await supabase
    .from("revoked_tokens")
    .select("jti")
    .eq("jti", payload.jti)
    .maybeSingle();
  if (error) throw error;
  if (revoked) {
    throw new HttpError(401, "Token tidak valid atau sudah kedaluwarsa");
  }

  req.user = { wallet: payload.sub, jti: payload.jti, exp: payload.exp };
  next();
}

const roleChecks = { admin: isAdmin, issuer: isIssuer };

// Roles are read from the contract on every request, so removing an issuer on-chain takes effect immediately.
export function requireRole(role) {
  const check = roleChecks[role];
  return async (req, res, next) => {
    if (!(await check(req.user.wallet))) {
      throw new HttpError(403, `Hanya ${role} yang boleh mengakses endpoint ini`);
    }
    next();
  };
}
