import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  return createClient(
    // ← createClient must be INSIDE the function
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
