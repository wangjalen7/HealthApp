export async function biometricFunctionError(error: unknown) {
  // React Native fetch responses need not share the global Response constructor.
  const context =
    error && typeof error === "object" && "context" in error
      ? error.context
      : undefined;
  const response = context as
    | { status?: unknown; clone?: () => { json(): Promise<unknown> } }
    | undefined;
  const status =
    typeof response?.status === "number" ? response.status : undefined;
  let code: string | undefined;
  try {
    const body = await response?.clone?.().json();
    if (
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof body.code === "string"
    )
      code = body.code;
  } catch {
    /* An unavailable response body must not discard a saved credential. */
  }
  return { status, code };
}

export function faceIdLoginFailure({
  status,
  code,
}: {
  status?: number;
  code?: string;
}) {
  if (
    code === "device_upgrade_required" ||
    (status === 400 && code === "invalid_request")
  )
    return {
      success: false,
      invalidCredential: true,
      message:
        "Reload or update HealthApp, sign in with your password, then enable Face ID again in Profile > Face ID.",
    };
  // A gateway/session 401 is not proof that the device credential was revoked.
  // Only the biometric endpoint's explicit rejection may erase enrollment.
  if (status === 401 && code === "invalid_device_credential")
    return {
      success: false,
      invalidCredential: true,
      message:
        "Face ID sign-in needs to be enabled again. Sign in with your password, then enable Face ID in Profile > Face ID.",
    };
  if (code === "session_unavailable")
    return {
      success: false,
      message:
        "Face ID could not finish sign-in. Sign in with your password, then enable Face ID again in Profile > Face ID.",
    };
  return {
    success: false,
    message:
      "Face ID sign-in is temporarily unavailable. Try again or use your password.",
  };
}
