// ============================================================
// Fill these in from Supabase Dashboard > Project Settings > API
// SUPABASE_URL   = "Project URL"
// SUPABASE_ANON_KEY = "anon public" key (safe to expose in client code —
//   it can only do what your Row Level Security policies in schema.sql allow)
// ============================================================
const SUPABASE_URL = "https://uinahkovjmkeacyiwqwz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbmFoa292am1rZWFjeWl3cXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyODM1MzUsImV4cCI6MjEwMzg1OTUzNX0.uHYi4_TB8TR1pk_TIjy0nkOmzqxBlCbzi7hIcvxr6ss";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
