export type BiometricDeviceRequest =
  | { action: "authenticate"; credentialId: string; secret: string }
  | { action: "enroll" }
  | { action: "revoke"; credentialId: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

export function parseBiometricDeviceRequest(
  input: unknown,
): BiometricDeviceRequest | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (value.action === "enroll") return { action: "enroll" };
  if (
    value.action === "revoke" &&
    typeof value.credentialId === "string" &&
    uuidPattern.test(value.credentialId)
  ) {
    return { action: "revoke", credentialId: value.credentialId };
  }
  if (
    value.action === "authenticate" &&
    typeof value.credentialId === "string" &&
    uuidPattern.test(value.credentialId) &&
    typeof value.secret === "string" &&
    secretPattern.test(value.secret)
  ) {
    return {
      action: "authenticate",
      credentialId: value.credentialId,
      secret: value.secret,
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
