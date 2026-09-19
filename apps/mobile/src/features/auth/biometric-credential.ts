export type FaceIdLoginAccount = {
  credentialId: string;
  email: string;
  userId: string;
};

export type FaceIdLoginCredential = FaceIdLoginAccount & {
  secret: string;
  deviceId?: string;
};

export type RememberedLoginAccount = {
  email: string;
  userId: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

export function parseFaceIdLoginAccount(
  raw: string | null,
): FaceIdLoginAccount | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<FaceIdLoginAccount>;
    if (
      typeof parsed.email !== "string" ||
      !parsed.email.includes("@") ||
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.credentialId !== "string" ||
      !uuidPattern.test(parsed.credentialId)
    ) {
      return undefined;
    }
    return {
      credentialId: parsed.credentialId,
      email: parsed.email,
      userId: parsed.userId,
    };
  } catch {
    return undefined;
  }
}

export function parseFaceIdLoginCredential(
  raw: string | null,
  account: FaceIdLoginAccount,
): FaceIdLoginCredential | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<FaceIdLoginCredential>;
    if (
      parsed.userId !== account.userId ||
      parsed.email !== account.email ||
      parsed.credentialId !== account.credentialId ||
      typeof parsed.secret !== "string" ||
      !secretPattern.test(parsed.secret)
    ) {
      return undefined;
    }
    return {
      credentialId: parsed.credentialId,
      email: parsed.email,
      secret: parsed.secret,
      deviceId:
        typeof parsed.deviceId === "string" && uuidPattern.test(parsed.deviceId)
          ? parsed.deviceId
          : undefined,
      userId: parsed.userId,
    };
  } catch {
    return undefined;
  }
}

export function parseRememberedLoginAccount(
  raw: string | null,
): RememberedLoginAccount | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedLoginAccount>;
    if (
      typeof parsed.email !== "string" ||
      !parsed.email.includes("@") ||
      typeof parsed.userId !== "string" ||
      !parsed.userId
    ) {
      return undefined;
    }
    return { email: parsed.email, userId: parsed.userId };
  } catch {
    return undefined;
  }
}

export function parseBiometricEnrollmentResponse(
  input: unknown,
): Pick<FaceIdLoginCredential, "credentialId" | "secret"> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (
    typeof value.credentialId !== "string" ||
    !uuidPattern.test(value.credentialId) ||
    typeof value.secret !== "string" ||
    !secretPattern.test(value.secret)
  ) {
    return undefined;
  }
  return { credentialId: value.credentialId, secret: value.secret };
}

export function parseBiometricSessionResponse(
  input: unknown,
):
  | {
      accessToken: string;
      refreshToken: string;
      userId: string;
      nextSecret: string;
    }
  | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (
    typeof value.nextSecret !== "string" ||
    !secretPattern.test(value.nextSecret) ||
    typeof value.accessToken !== "string" ||
    !value.accessToken ||
    typeof value.refreshToken !== "string" ||
    !value.refreshToken ||
    typeof value.userId !== "string" ||
    !value.userId
  ) {
    return undefined;
  }
  return {
    nextSecret: value.nextSecret,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    userId: value.userId,
  };
}
