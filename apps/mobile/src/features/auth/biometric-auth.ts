import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { secureStoreAdapter } from "../../lib/secure-store";
import { supabase } from "../../lib/supabase";
import {
  parseBiometricEnrollmentResponse,
  parseBiometricSessionResponse,
  parseFaceIdLoginAccount,
  parseFaceIdLoginCredential,
  parseRememberedLoginAccount,
  type FaceIdLoginAccount,
  type FaceIdLoginCredential,
  type RememberedLoginAccount,
} from "./biometric-credential";

export type {
  FaceIdLoginAccount,
  RememberedLoginAccount,
} from "./biometric-credential";

const faceIdPreferenceKey = (userId: string) =>
  `healthapp.face-id-enabled.${userId}`;
const faceIdCredentialKey = (userId: string) =>
  `healthapp.face-id-credential.${userId}`;
const faceIdAccountKey = "healthapp.face-id-account";
const rememberedAccountKey = "healthapp.remembered-login-account";

const biometricCredentialOptions: SecureStore.SecureStoreOptions = {
  authenticationPrompt: "Use Face ID to sign in to HealthApp",
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

export type FaceIdAvailability = {
  available: boolean;
  reason?: string;
};

export type FaceIdAuthenticationResult = {
  invalidCredential?: boolean;
  message?: string;
  success: boolean;
};

export async function getFaceIdAvailability(): Promise<FaceIdAvailability> {
  if (Platform.OS !== "ios") {
    return { available: false, reason: "Face ID is available on iPhone." };
  }
  try {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (
      !hasHardware ||
      !supportedTypes.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      )
    ) {
      return {
        available: false,
        reason: "Face ID is not available on this iPhone.",
      };
    }
    if (!isEnrolled) {
      return {
        available: false,
        reason: "Set up Face ID in iPhone Settings before enabling it here.",
      };
    }
    return { available: true };
  } catch {
    return {
      available: false,
      reason: "Face ID requires the latest HealthApp development build.",
    };
  }
}

export async function isFaceIdEnabled(userId: string): Promise<boolean> {
  const [preference, account] = await Promise.all([
    secureStoreAdapter.getItem(faceIdPreferenceKey(userId)),
    getFaceIdLoginAccount(),
  ]);
  return preference === "true" && account?.userId === userId;
}

export async function getFaceIdLoginAccount(): Promise<
  FaceIdLoginAccount | undefined
> {
  const raw = await secureStoreAdapter.getItem(faceIdAccountKey);
  const account = parseFaceIdLoginAccount(raw);
  if (account || !raw) return account;

  // The previous implementation stored the reusable account password. Remove
  // that legacy Keychain item rather than migrating it into the new flow.
  try {
    const legacy = JSON.parse(raw) as { email?: unknown; userId?: unknown };
    if (typeof legacy.userId === "string" && legacy.userId) {
      await SecureStore.deleteItemAsync(faceIdCredentialKey(legacy.userId));
      await secureStoreAdapter.removeItem(faceIdPreferenceKey(legacy.userId));
      if (typeof legacy.email === "string" && legacy.email.includes("@")) {
        await saveRememberedLoginAccount({
          email: legacy.email,
          userId: legacy.userId,
        });
      }
    }
  } catch {
    // An invalid non-sensitive marker can simply be discarded.
  }
  await secureStoreAdapter.removeItem(faceIdAccountKey);
  return undefined;
}

export async function getRememberedLoginAccount(): Promise<
  RememberedLoginAccount | undefined
> {
  return parseRememberedLoginAccount(
    await secureStoreAdapter.getItem(rememberedAccountKey),
  );
}

export async function saveRememberedLoginAccount(
  account: RememberedLoginAccount,
): Promise<void> {
  await secureStoreAdapter.setItem(
    rememberedAccountKey,
    JSON.stringify(account),
  );
}

export async function removeRememberedLoginAccount(): Promise<void> {
  await secureStoreAdapter.removeItem(rememberedAccountKey);
}

export async function saveFaceIdLoginCredential(
  credential: FaceIdLoginCredential,
): Promise<void> {
  if (Platform.OS !== "ios") {
    throw new Error("Face ID sign-in is available only on iPhone.");
  }
  await SecureStore.setItemAsync(
    faceIdCredentialKey(credential.userId),
    JSON.stringify(credential),
    biometricCredentialOptions,
  );
  const account: FaceIdLoginAccount = {
    credentialId: credential.credentialId,
    email: credential.email,
    userId: credential.userId,
  };
  await secureStoreAdapter.setItem(faceIdAccountKey, JSON.stringify(account));
  await saveRememberedLoginAccount(account);
  await secureStoreAdapter.setItem(
    faceIdPreferenceKey(credential.userId),
    "true",
  );
}

export async function enrollFaceIdLoginCredential(
  account: RememberedLoginAccount,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("biometric-auth", {
    body: { action: "enroll" },
  });
  const enrollment = parseBiometricEnrollmentResponse(data);
  if (error || !enrollment) {
    throw new Error("Could not register this iPhone for Face ID sign-in.");
  }
  await saveFaceIdLoginCredential({ ...account, ...enrollment });
}

export async function getFaceIdLoginCredential(): Promise<
  FaceIdLoginCredential | undefined
> {
  const account = await getFaceIdLoginAccount();
  if (!account || Platform.OS !== "ios") return undefined;
  const raw = await SecureStore.getItemAsync(
    faceIdCredentialKey(account.userId),
    biometricCredentialOptions,
  );
  return parseFaceIdLoginCredential(raw, account);
}

export async function signInWithFaceIdCredential(): Promise<FaceIdAuthenticationResult> {
  const credential = await getFaceIdLoginCredential();
  if (!credential) {
    return {
      invalidCredential: true,
      message: "Face ID sign-in must be enabled again with your password.",
      success: false,
    };
  }
  const { data, error } = await supabase.functions.invoke("biometric-auth", {
    body: {
      action: "authenticate",
      credentialId: credential.credentialId,
      secret: credential.secret,
    },
  });
  const response = parseBiometricSessionResponse(data);
  if (error || !response || response.userId !== credential.userId) {
    const status =
      error &&
      typeof error === "object" &&
      "context" in error &&
      error.context instanceof Response
        ? error.context.status
        : undefined;
    return {
      invalidCredential: status === 401,
      message:
        status === 401
          ? "Face ID sign-in was revoked. Sign in with your password and enable it again."
          : "Face ID sign-in is temporarily unavailable. Try again or use your password.",
      success: false,
    };
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: response.accessToken,
    refresh_token: response.refreshToken,
  });
  if (sessionError) {
    return {
      message: "Could not complete Face ID sign-in. Use your password instead.",
      success: false,
    };
  }
  return { success: true };
}

export async function revokeFaceIdLoginCredential(
  userId: string,
): Promise<void> {
  const account = await getFaceIdLoginAccount();
  if (account?.userId === userId) {
    const { error } = await supabase.functions.invoke("biometric-auth", {
      body: { action: "revoke", credentialId: account.credentialId },
    });
    if (error) throw new Error("Could not revoke Face ID sign-in.");
  }
  await removeFaceIdLoginCredential(userId);
}

export async function removeFaceIdLoginCredential(
  userId: string,
): Promise<void> {
  await SecureStore.deleteItemAsync(faceIdCredentialKey(userId));
  await secureStoreAdapter.removeItem(faceIdPreferenceKey(userId));
  const account = await getFaceIdLoginAccount();
  if (account?.userId === userId) {
    await secureStoreAdapter.removeItem(faceIdAccountKey);
  }
}

export async function authenticateWithFaceId(
  promptMessage: string,
): Promise<FaceIdAuthenticationResult> {
  const availability = await getFaceIdAvailability();
  if (!availability.available) {
    return { success: false, message: availability.reason };
  }
  try {
    const result = await LocalAuthentication.authenticateAsync({
      cancelLabel: "Cancel",
      disableDeviceFallback: true,
      fallbackLabel: "",
      promptMessage,
    });
    if (result.success) return { success: true };
    if (
      result.error === "user_cancel" ||
      result.error === "app_cancel" ||
      result.error === "system_cancel"
    ) {
      return { success: false, message: "Face ID was canceled." };
    }
    if (result.error === "lockout") {
      return {
        success: false,
        message:
          "Face ID is temporarily locked. Unlock your iPhone and try again.",
      };
    }
    return {
      success: false,
      message: "Face ID could not verify you. Try again or use your password.",
    };
  } catch {
    return {
      success: false,
      message: "Face ID could not start. Try again or use your password.",
    };
  }
}
