// End-to-end check of every endpoint against the running backend (npm run dev in another terminal).
// Uses real Supabase, the real Sepolia contract, and Pinata. Local use only.
//   node --env-file=.env scripts/smoke-test.js
import { Wallet, sha256 } from "ethers";
import { SiweMessage } from "siwe";
import { signSession } from "../src/lib/session.js";

const BASE = `http://localhost:${process.env.PORT ?? 4000}`;
const FRONTEND = new URL(process.env.FRONTEND_ORIGIN);
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);
const ADMIN_WALLET = "0x5eDebdC977AC66de68D2b7a7EC717382db98D002";
const ISSUER_WALLET = "0x821b1DA745835553c56a87BE2141744486b2056a";

let passed = 0;
let failed = 0;

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function check(name, res, expected, extra = true) {
  const ok = res.status === expected && extra;
  if (ok) passed++;
  else failed++;
  const detail = ok ? "" : `  -> got ${res.status} ${JSON.stringify(res.json)}`;
  console.log(`${ok ? "PASS" : "FAIL"}  [${expected}] ${name}${detail}`);
}

async function siweLogin(wallet, overrides = {}) {
  const { json } = await call("POST", "/auth/nonce", { body: { address: wallet.address } });
  const message = new SiweMessage({
    domain: FRONTEND.host,
    address: wallet.address,
    statement: "Login ke SertiChain",
    uri: FRONTEND.origin,
    version: "1",
    chainId: CHAIN_ID,
    nonce: json?.nonce,
    ...overrides,
  }).prepareMessage();
  return { message, signature: await wallet.signMessage(message) };
}

function pdfForm(bytes, type = "application/pdf") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), "test.pdf");
  return form;
}

console.log(`Testing ${BASE}\n`);

// ---------- Health ----------
check("GET /health", await call("GET", "/health"), 200);

// ---------- Auth (F-01, F-02) ----------
console.log("\n# Auth");
const user = Wallet.createRandom();
check("nonce: invalid address rejected", await call("POST", "/auth/nonce", { body: { address: "bukan-address" } }), 400);

const login = await siweLogin(user);
const verify = await call("POST", "/auth/verify", { body: login });
check("verify: valid SIWE login returns token", verify, 200, typeof verify.json?.token === "string");
const token = verify.json?.token;

check("verify: same nonce cannot be reused", await call("POST", "/auth/verify", { body: login }), 401);
check("verify: wrong domain rejected", await call("POST", "/auth/verify", { body: await siweLogin(user, { domain: "evil.com" }) }), 401);
check("verify: wrong chain rejected", await call("POST", "/auth/verify", { body: await siweLogin(user, { chainId: 1 }) }), 401);
const forged = await siweLogin(user);
check(
  "verify: signature from another wallet rejected",
  await call("POST", "/auth/verify", { body: { message: forged.message, signature: await Wallet.createRandom().signMessage(forged.message) } }),
  401,
);
check("verify: made-up nonce rejected", await call("POST", "/auth/verify", { body: await siweLogin(user, { nonce: "abcdefgh12345678" }) }), 401);

// ---------- Profile (F-11) ----------
console.log("\n# Profile /users/me");
check("no token rejected", await call("GET", "/users/me"), 401);
check("garbage token rejected", await call("GET", "/users/me", { token: "abc.def.ghi" }), 401);
check("GET before profile exists", await call("GET", "/users/me", { token }), 404);
check(
  "POST with extra field (wallet_address) rejected",
  await call("POST", "/users/me", { token, body: { full_name: "Tes", wallet_address: ADMIN_WALLET } }),
  400,
);
check("POST invalid email rejected", await call("POST", "/users/me", { token, body: { full_name: "Tes", email: "bukan-email" } }), 400);
const created = await call("POST", "/users/me", {
  token,
  body: { full_name: "Smoke Test", student_id: "2500000000", email: "smoke@test.com" },
});
check("POST creates profile", created, 201, created.json?.wallet_address === user.address.toLowerCase());
check("POST twice gives conflict", await call("POST", "/users/me", { token, body: { full_name: "Lagi" } }), 409);
check("PUT empty body rejected", await call("PUT", "/users/me", { token, body: {} }), 400);
const updated = await call("PUT", "/users/me", { token, body: { full_name: "Smoke Test Updated" } });
check("PUT updates only sent field", updated, 200, updated.json?.full_name === "Smoke Test Updated" && updated.json?.email === "smoke@test.com");
check("GET returns profile", await call("GET", "/users/me", { token }), 200);

// ---------- Public (F-09) ----------
console.log("\n# Public /public/profiles/:wallet");
const pub = await call("GET", `/public/profiles/${user.address}`);
check("returns only full_name", pub, 200, JSON.stringify(Object.keys(pub.json ?? {})) === '["full_name"]');
check("invalid wallet rejected", await call("GET", "/public/profiles/xyz"), 400);
check("unknown wallet gives 404", await call("GET", `/public/profiles/${Wallet.createRandom().address}`), 404);

// ---------- Admin (F-12), role read from the Sepolia contract ----------
console.log("\n# Admin (role from contract)");
const adminToken = signSession(ADMIN_WALLET);
check("non-admin rejected", await call("GET", "/admin/users", { token }), 403);
const list = await call("GET", "/admin/users?page=1&limit=5", { token: adminToken });
check("admin lists users", list, 200, Array.isArray(list.json?.data) && typeof list.json?.total === "number");
check("limit > 100 rejected", await call("GET", "/admin/users?limit=500", { token: adminToken }), 400);
check("unknown query param rejected", await call("GET", "/admin/users?foo=1", { token: adminToken }), 400);
check("delete: invalid id rejected", await call("DELETE", "/admin/users/123", { token: adminToken }), 400);
check(
  "delete: unknown id gives 404",
  await call("DELETE", "/admin/users/00000000-0000-4000-8000-000000000000", { token: adminToken }),
  404,
);

// Admin deletes a second throwaway profile.
const victim = Wallet.createRandom();
const victimProfile = await call("POST", "/users/me", { token: signSession(victim.address), body: { full_name: "Hapus Saya" } });
if (victimProfile.json?.id) {
  check("non-admin cannot delete", await call("DELETE", `/admin/users/${victimProfile.json.id}`, { token }), 403);
  check("admin deletes user", await call("DELETE", `/admin/users/${victimProfile.json.id}`, { token: adminToken }), 204);
}

// ---------- Files (F-05, F-10), role read from the Sepolia contract ----------
console.log("\n# Files");
const issuerToken = signSession(ISSUER_WALLET);
const pdf = Buffer.from(`%PDF-1.4\n% SertiChain smoke test ${new Date().toISOString()}\n%%EOF\n`);
check("no token rejected", await call("POST", "/files", { form: pdfForm(pdf) }), 401);
check("non-issuer rejected", await call("POST", "/files", { token, form: pdfForm(pdf) }), 403);
check("non-PDF mimetype rejected", await call("POST", "/files", { token: issuerToken, form: pdfForm(pdf, "text/plain") }), 400);
check(
  "fake PDF (wrong header) rejected",
  await call("POST", "/files", { token: issuerToken, form: pdfForm(Buffer.from("MZ not a pdf")) }),
  400,
);
check(
  "file over 5 MB rejected",
  await call("POST", "/files", { token: issuerToken, form: pdfForm(Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)])) }),
  400,
);
if (process.env.PINATA_JWT) {
  const up = await call("POST", "/files", { token: issuerToken, form: pdfForm(pdf) });
  const expectedHash = sha256(new Uint8Array(pdf));
  check("issuer uploads PDF to Pinata", up, 200, up.json?.fileHash === expectedHash && typeof up.json?.cid === "string");
  if (up.json?.cid) console.log(`      cid: ${up.json.cid}`);
} else {
  console.log("SKIP  upload to Pinata (PINATA_JWT is empty in .env)");
}

// ---------- Logout + cleanup ----------
console.log("\n# Logout + cleanup");
check("DELETE /users/me removes test profile", await call("DELETE", "/users/me", { token }), 204);
check("logout", await call("POST", "/auth/logout", { token }), 204);
check("token rejected after logout", await call("GET", "/users/me", { token }), 401);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
