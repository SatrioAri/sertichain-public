import { z } from "zod";
import { isAddress } from "ethers";

export const walletSchema = z
  .string()
  .refine((value) => isAddress(value), "wallet address tidak valid")
  .transform((value) => value.toLowerCase());

export const nonceRequestSchema = z.object({
  address: walletSchema,
});

export const verifyRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "signature tidak valid"),
});

// strict() rejects extra fields, so a client cannot set id or wallet_address through the profile form.
export const profileSchema = z
  .object({
    full_name: z.string().trim().min(1).max(100),
    student_id: z.string().trim().max(20).optional(),
    email: z.email().max(100).optional(),
    avatar_url: z.url({ protocol: /^https$/ }).optional(),
  })
  .strict();

export const profileUpdateSchema = profileSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "minimal satu field harus diisi");

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const userIdParamsSchema = z.object({
  id: z.uuid(),
});

export const walletParamsSchema = z.object({
  wallet: walletSchema,
});
