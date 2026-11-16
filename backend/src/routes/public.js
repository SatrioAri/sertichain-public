import { Router } from "express";
import { HttpError } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";
import { validateParams } from "../middleware/validate.js";
import { walletParamsSchema } from "../schemas.js";

export const publicRouter = Router();

// F-09: anyone can open the verification page, so only full_name ever leaves this endpoint.
publicRouter.get("/profiles/:wallet", validateParams(walletParamsSchema), async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("full_name")
    .eq("wallet_address", req.params.wallet)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(404, "Profil tidak ditemukan");
  res.json({ full_name: data.full_name });
});
