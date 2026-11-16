import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// The service_role key bypasses RLS, so this client must never be exposed to the frontend.
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
