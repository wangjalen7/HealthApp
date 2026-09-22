export type BiometricDeviceRequest =
  | {
      action: "authenticate";
      credentialId: string;
      secret: string;
      deviceId: string;
    }
  | {
      action: "enroll";
      password: string;
      otp?: string;
      deviceId: string;
      deviceName: string;
      userId: string;
    }
  | { action: "list" | "revokeAll" }
  | { action: "revoke"; credentialId: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

// Identify the previous protocol only to return an actionable rejection.
// Legacy credentials must never be upgraded into a session without reenrollment.
export function isLegacyBiometricAuthentication(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const value = input as Record<string, unknown>;
  return (
    value.action === "authenticate" &&
    value.deviceId === undefined &&
    typeof value.credentialId === "string" &&
    uuidPattern.test(value.credentialId) &&
    typeof value.secret === "string" &&
    secretPattern.test(value.secret)
  );
}

export function parseBiometricDeviceRequest(
  input: unknown,
): BiometricDeviceRequest | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (value.action === "list" || value.action === "revokeAll")
    return { action: value.action };
  if (
    value.action === "enroll" &&
    typeof value.userId === "string" &&
    uuidPattern.test(value.userId) &&
    ((typeof value.password === "string" &&
      value.password.length > 0 &&
      value.password.length <= 1024) ||
      (typeof value.otp === "string" && /^\d{6}$/.test(value.otp))) &&
    typeof value.deviceId === "string" &&
    uuidPattern.test(value.deviceId) &&
    typeof value.deviceName === "string" &&
    value.deviceName.trim().length > 0 &&
    value.deviceName.length <= 80
  )
    return {
      action: "enroll",
      userId: value.userId,
      password: typeof value.password === "string" ? value.password : "",
      ...(typeof value.otp === "string" ? { otp: value.otp } : {}),
      deviceId: value.deviceId,
      deviceName: value.deviceName.trim(),
    };
  if (
    value.action === "revoke" &&
    typeof value.credentialId === "string" &&
    uuidPattern.test(value.credentialId)
  ) {
    return { action: "revoke", credentialId: value.credentialId };
  }
  if (
    value.action === "authenticate" &&
    typeof value.deviceId === "string" &&
    uuidPattern.test(value.deviceId) &&
    typeof value.credentialId === "string" &&
    uuidPattern.test(value.credentialId) &&
    typeof value.secret === "string" &&
    secretPattern.test(value.secret)
  ) {
    return {
      action: "authenticate",
      credentialId: value.credentialId,
      secret: value.secret,
      deviceId: value.deviceId,
    };
  }
  return undefined;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function hashDeviceSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return bytesToHex(new Uint8Array(digest));
}
