import { createClient } from "npm:@supabase/supabase-js@2.112.4";

import {
  bytesToBase64Url,
  hashDeviceSecret,
  parseBiometricDeviceRequest,
} from "../_shared/biometric-device.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });

function defaultKey(variable: string, legacy: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (raw) {
    try {
      const values = JSON.parse(raw) as Record<string, string>;
      if (values.default) return values.default;
    } catch {
      // Hosted projects may expose either the current JSON key collection or
      // the legacy individual secret.
    }
  }
  return Deno.env.get(legacy);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed", message: "Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = defaultKey(
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  );
  const secretKey = defaultKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json(
      {
        code: "server_configuration",
        message: "Biometric sign-in is unavailable.",
      },
      500,
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ code: "invalid_request", message: "Invalid request." }, 400);
  }
  const body = parseBiometricDeviceRequest(input);
  if (!body) {
    return json({ code: "invalid_request", message: "Invalid request." }, 400);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "authenticate") {
    const tokenHash = await hashDeviceSecret(body.secret);
    const { data: credential, error: credentialError } = await admin
      .from("biometric_device_credentials")
      .select("id,user_id")
      .eq("id", body.credentialId)
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (credentialError || !credential) {
      return json(
        {
          code: "invalid_device_credential",
          message: "Face ID sign-in must be enabled again with your password.",
        },
        401,
      );
    }

    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(credential.user_id);
    const email = userData.user?.email;
    if (userError || !email) {
      return json(
        {
          code: "invalid_device_credential",
          message: "Face ID sign-in must be enabled again with your password.",
        },
        401,
      );
    }

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !linkData.properties.hashed_token) {
      return json(
        { code: "session_unavailable", message: "Could not start sign-in." },
        503,
      );
    }
    const verifier = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sessionData, error: sessionError } =
      await verifier.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: "magiclink",
      });
    if (sessionError || !sessionData.session) {
      return json(
        { code: "session_unavailable", message: "Could not complete sign-in." },
        503,
      );
    }

    await admin
      .from("biometric_device_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", credential.id);
    return json({
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      userId: sessionData.user?.id,
    });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "unauthorized", message: "Sign in to continue." }, 401);
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (authError || !authData.user) {
    return json(
      { code: "unauthorized", message: "Your session has expired." },
      401,
    );
  }

  if (body.action === "revoke") {
    const { error } = await admin
      .from("biometric_device_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", body.credentialId)
      .eq("user_id", authData.user.id)
      .is("revoked_at", null);
    if (error) {
      return json(
        { code: "revoke_failed", message: "Could not disable Face ID." },
        500,
      );
    }
    return json({ success: true });
  }

  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = bytesToBase64Url(secretBytes);
  const tokenHash = await hashDeviceSecret(secret);
  const { data: credential, error } = await admin
    .from("biometric_device_credentials")
    .insert({ user_id: authData.user.id, token_hash: tokenHash })
    .select("id")
    .single();
  if (error || !credential) {
    return json(
      { code: "enrollment_failed", message: "Could not enable Face ID." },
      500,
    );
  }
  return json({ credentialId: credential.id, secret });
});
