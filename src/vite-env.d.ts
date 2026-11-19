/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (cloud saves and profiles; optional, see docs/supabase.md). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anonymous (public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
