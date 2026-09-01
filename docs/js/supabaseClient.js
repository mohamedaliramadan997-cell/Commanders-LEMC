// ============================================================
// Fill these in from Supabase Dashboard > Project Settings > API
// SUPABASE_URL   = "Project URL"
// SUPABASE_ANON_KEY = "anon public" key (safe to expose in client code —
//   it can only do what your Row Level Security policies in schema.sql allow)
// ============================================================
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
