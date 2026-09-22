import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyEnrollmentPassword } from "../_shared/biometric-enrollment.ts";
import { cleanupAccount } from "./cleanup.ts";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const key = (modern: string, legacy: string) => {
  const raw = Deno.env.get(modern);
  if (raw) { try { return JSON.parse(raw).default as string; } catch { /* Legacy fallback. */ } }
  return Deno.env.get(legacy)!;
};
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Use POST." }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ message: "Invalid request." }, 400); }
  if (!body || typeof body !== "object" || !/^[a-f0-9-]{72}$/.test(body.token ?? "") || !["prepare", "run", "cancel"].includes(body.action)) return json({ message: "Invalid deletion request." }, 400);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2,"0")).join("");
  const url = Deno.env.get("SUPABASE_URL")!;
  const publicKey = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const admin = createClient(url, key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (body.action === "cancel") {
      const { data, error } = await admin.rpc("cancel_unstarted_deletion", { p_hash: hash });
      if (error) throw error;
      return json({ cancelled: data === true, prepared: data !== true });
    }
    const { data: job, error: readError } = await admin.from("account_deletion_jobs").select("user_id,completed,cancelled").eq("token_hash", hash).maybeSingle();
    if (readError) throw readError;
    if (job?.cancelled) return json({ cancelled: true });
    if (job?.completed) return json({ completed: true });
    if (!job) {
      if (body.action === "run") return json({ code: "not_started", message: "Deletion has not started." }, 404);
      if (body.confirmation !== "DELETE" || typeof body.password !== "string") return json({ message: "Confirm deletion and enter your current password." }, 400);
      const jwt = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
      if (!jwt) return json({ message: "Sign in again." }, 401);
      const { data: verified, error } = await admin.auth.getUser(jwt);
      if (error || !verified.user?.email) return json({ message: "Sign in with your email account first." }, 401);
      const verifier = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const proof = await verifyEnrollmentPassword(verified.user.id, body.password, (password) => verifier.auth.signInWithPassword({ email: verified.user.email!, password }));
      if (!proof) return json({ message: "Your current password could not be verified." }, 403);
      // Password verification is server-side and must match the verified bearer user.
      const { error: startError } = await admin.rpc("prepare_account_deletion", { p_user_id: verified.user.id, p_hash: hash });
      await verifier.auth.signOut({ scope: "local" });
      if (startError) throw startError;
      return json({ prepared: true });
    }
    if (body.action === "prepare") return json({ prepared: true });
    await cleanupAccount({
      list: async () => { const { data, error } = await admin.rpc("account_deletion_objects", { p_user_id: job.user_id }); if (error) throw error; return data ?? []; },
      remove: async (bucket, paths) => { const { error } = await admin.storage.from(bucket).remove(paths); if (error) throw error; },
      deleteAuth: async () => { const { error } = await admin.auth.admin.deleteUser(job.user_id); if (error && error.code !== "user_not_found") throw error; },
      finish: async () => { const { error } = await admin.rpc("finish_account_deletion", { p_hash: hash }); if (error) throw error; },
    });
    return json({ completed: true });
  } catch {
    // No health data, credentials or raw provider errors enter logs/responses.
    return json({ message: "Deletion is not complete. Retry to safely continue." }, 503);
  }
});
