import { verifyEnrollmentPassword } from "../_shared/biometric-enrollment.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

import {
  bytesToBase64Url,
  hashDeviceSecret,
  isLegacyBiometricAuthentication,
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
  if (isLegacyBiometricAuthentication(input)) {
    return json(
      {
        code: "device_upgrade_required",
        message:
          "Reload or update HealthApp, sign in with your password, then enable Face ID again in Profile Settings.",
      },
      401,
    );
  }
  const body = parseBiometricDeviceRequest(input);
  if (!body) {
    return json({ code: "invalid_request", message: "Invalid request." }, 400);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "authenticate") {
    const nextSecret = bytesToBase64Url(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const tokenHash = await hashDeviceSecret(body.secret);
    const { data: credentialUserId, error: credentialError } = await admin.rpc(
      "consume_biometric_device",
      {
        p_id: body.credentialId,
        p_device_id: body.deviceId,
        p_hash: tokenHash,
        p_next_hash: await hashDeviceSecret(nextSecret),
      },
    );
    const credential = credentialUserId
      ? { user_id: credentialUserId as string }
      : undefined;
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
    if (
      sessionError ||
      !sessionData.session ||
      sessionData.user?.id !== credential.user_id
    ) {
      if (sessionData.session) await verifier.auth.signOut({ scope: "local" });
      return json(
        { code: "session_unavailable", message: "Could not complete sign-in." },
        503,
      );
    }

    const { data: stillValid } = await admin
      .from("biometric_device_credentials")
      .select("id")
      .eq("id", body.credentialId)
      .eq("token_hash", await hashDeviceSecret(nextSecret))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!stillValid) {
      await verifier.auth.signOut({ scope: "local" });
      return json(
        {
          code: "invalid_device_credential",
          message: "Face ID login was revoked. Use your password.",
        },
        401,
      );
    }
    return json({
      nextSecret,
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

  const { error: sessionCheck } = await userClient.rpc(
    "require_active_session",
    { p_user_id: authData.user.id },
  );
  if (sessionCheck)
    return json(
      { code: "unauthorized", message: "Sign in again to continue." },
      401,
    );
  if (body.action === "list") {
    const { data, error } = await admin
      .from("biometric_device_credentials")
      .select(
        "id,device_id,device_name,created_at,last_used_at,expires_at,revoked_at",
      )
      .eq("user_id", authData.user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return error
      ? json({ message: "Could not load devices." }, 503)
      : json({ devices: data });
  }
  if (body.action === "revokeAll") {
    const { error } = await admin
      .from("biometric_device_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", authData.user.id)
      .is("revoked_at", null);
    return error
      ? json({ message: "Could not revoke devices." }, 503)
      : json({ success: true });
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

  if (body.userId !== authData.user.id)
    return json(
      {
        code: "account_changed",
        message: "Reopen Settings for the signed-in account.",
      },
      401,
    );
  // Never trust a client reauthentication flag or the existing bearer session.
  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await verifyEnrollmentPassword(
    authData.user.id,
    body.password,
    (password) =>
      verifier.auth.signInWithPassword({
        email: authData.user!.email!,
        password,
      }),
  );
  if (!verified?.session || !verified.user) {
    return json(
      {
        code: "reauthentication_required",
        message: "Verify your current password to enable Face ID.",
      },
      401,
    );
  }
  try {
    const claims = JSON.parse(
      atob(
        verified.session.access_token
          .split(".")[1]
          .replaceAll("-", "+")
          .replaceAll("_", "/"),
      ),
    ) as { session_id: string };
    const secret = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const { data: credentialId, error } = await admin.rpc(
      "enroll_biometric_device",
      {
        p_user_id: verified.user.id,
        p_device_id: body.deviceId,
        p_name: body.deviceName,
        p_hash: await hashDeviceSecret(secret),
        p_verified_session: claims.session_id,
      },
    );
    if (error || !credentialId)
      return json(
        { code: "enrollment_failed", message: "Could not enable Face ID." },
        503,
      );
    return json({ credentialId, secret });
  } finally {
    await verifier.auth.signOut({ scope: "local" });
  }
});
