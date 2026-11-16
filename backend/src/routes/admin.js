import { Router } from "express";
import { HttpError } from "../lib/http.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { paginationQuerySchema, userIdParamsSchema } from "../schemas.js";

export const adminRouter = Router();

const PROFILE_COLUMNS = "id, wallet_address, full_name, student_id, email, avatar_url, created_at, updated_at";

adminRouter.use(requireAuth, requireRole("admin"));

// F-12: all profiles, newest first, paginated.
adminRouter.get("/users", validateQuery(paginationQuerySchema), async (req, res) => {
  const { page, limit } = req.validatedQuery;
  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from("users")
    .select(PROFILE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;
  res.json({ data, page, limit, total: count ?? 0 });
});

// F-12: delete one profile by id.
adminRouter.delete("/users/:id", validateParams(userIdParamsSchema), async (req, res) => {
  const { data, error } = await supabase.from("users").delete().eq("id", req.params.id).select("id");

  if (error) throw error;
  if (!data?.length) throw new HttpError(404, "Pengguna tidak ditemukan");
  res.status(204).end();
});
