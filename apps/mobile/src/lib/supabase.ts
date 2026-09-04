import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

import { supabaseConfig } from "./config";
import { secureStoreAdapter } from "./secure-store";

const projectReference = (() => {
  try {
    return new URL(supabaseConfig.url).hostname.split(".")[0];
  } catch {
    return undefined;
  }
})();

export async function removeLegacyPersistedSupabaseSession(): Promise<void> {
  if (!projectReference || projectReference === "placeholder") return;
  await secureStoreAdapter.removeItem(`sb-${projectReference}-auth-token`);
}
export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey,
  {
    auth: {
      autoRefreshToken: true,
      // Active sessions live only for this app process. Relaunch returns to the
      // sign-in screen, where a remembered Face ID device credential can create
      // a fresh session without retaining the user's reusable password.
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);
