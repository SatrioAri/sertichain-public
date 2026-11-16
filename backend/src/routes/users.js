import { Router } from "express";
import { HttpError } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { profileSchema, profileUpdateSchema } from "../schemas.js";

export const usersRouter = Router();

const PROFILE_COLUMNS = "id, wallet_address, full_name, student_id, email, avatar_url, created_at, updated_at";

usersRouter.use(requireAuth);

// The wallet always comes from the token, never from the request.
usersRouter.get("/me", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("wallet_address", req.user.wallet)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(404, "Profil belum dibuat");
  res.json(data);
});

usersRouter.post("/me", validateBody(profileSchema), async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .insert({ ...req.body, wallet_address: req.user.wallet })
    .select(PROFILE_COLUMNS)
    .single();

  if (error?.code === "23505") throw new HttpError(409, "Profil sudah ada");
  if (error) throw error;
  res.status(201).json(data);
});

usersRouter.put("/me", validateBody(profileUpdateSchema), async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .update(req.body)
    .eq("wallet_address", req.user.wallet)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(404, "Profil belum dibuat");
  res.json(data);
});

usersRouter.delete("/me", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .delete()
    .eq("wallet_address", req.user.wallet)
    .select("id");

  if (error) throw error;
  if (!data?.length) throw new HttpError(404, "Profil belum dibuat");
  res.status(204).end();
});
