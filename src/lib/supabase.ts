import { createClient } from "@supabase/supabase-js";

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey: string | undefined =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl?.trim()) {
  throw new Error("Missing required environment variable: VITE_SUPABASE_URL");
}

if (!supabasePublishableKey?.trim()) {
  throw new Error(
    "Missing required environment variable: VITE_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
