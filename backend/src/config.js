import { z } from "zod";
import { isAddress } from "ethers";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.url(),
  CHAIN_ID: z.coerce.number().int().default(11155111),
  JWT_SECRET: z.string().min(32, "minimal 32 karakter"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  SEPOLIA_RPC_URL: z.url(),
  CONTRACT_ADDRESS: z.string().refine((value) => isAddress(value), "bukan address yang valid"),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PINATA_JWT: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Isi .env belum lengkap atau tidak valid:");
  for (const issue of parsed.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;

// SIWE messages must name the frontend host, so a signature made for another site is rejected.
export const siweDomain = new URL(config.FRONTEND_ORIGIN).host;
