import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { supabaseConfig } from "../../lib/config";
import { assertAccount } from "../../lib/mutations";
// Verification may return a session. Isolate it until its user ID is checked so
// an identifier collision can never switch the application's current account.
export async function verifyContact(
  userId: string,
  kind: "phone" | "email",
  value: string,
  token: string,
) {
  await assertAccount(userId);
  const current = (await supabase.auth.getSession()).data.session;
  const verifier = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "contact-verification",
    },
    global: { headers: { Authorization: "Bearer " + current!.access_token } },
  });
  const { data, error } = await verifier.auth.verifyOtp(
    kind === "phone"
      ? { phone: value, token, type: "phone_change" }
      : { email: value, token, type: "email_change" },
  );
  if (error) throw error;
  if (data.user && data.user.id !== userId) {
    if (data.session) await verifier.auth.signOut({ scope: "local" });
    throw Error(
      "This contact could not be attached to your current account. Sign in to its original account instead.",
    );
  }
  await assertAccount(userId);
  const refreshed = await supabase.auth.getUser();
  if (refreshed.error) throw refreshed.error;
  const user = refreshed.data.user;
  const same =
    kind === "phone"
      ? user.phone?.replace(/^\+/, "") === value.replace(/^\+/, "")
      : user.email?.toLowerCase() === value.toLowerCase();
  const confirmed =
    kind === "phone" ? user.phone_confirmed_at : user.email_confirmed_at;
  if (!same || !confirmed)
    throw Error(
      "Verification is still pending. Check any confirmation sent to your existing contact too.",
    );
  await supabase.auth.refreshSession();
  return user;
}
