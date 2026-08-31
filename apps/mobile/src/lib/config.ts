const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfig = {
  url: url ?? 'https://placeholder.supabase.co',
  anonKey: anonKey ?? 'placeholder-anon-key',
  isConfigured: Boolean(url && anonKey),
} as const;
