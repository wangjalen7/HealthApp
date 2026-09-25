import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import {
  biometricFunctionError,
  faceIdLoginFailure,
} from "./biometric-function-error";

import { createUuid } from "../../lib/id";
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
  // Enrollment/rotation has already invalidated the previous server secret.
  // On iOS, updating an existing authenticated Keychain item prompts again;
  // creating a new protected item does not. Remove the unusable old value first.
  // A failed replacement leaves password sign-in as the recovery path.
  await SecureStore.deleteItemAsync(faceIdCredentialKey(credential.userId));
  await SecureStore.setItemAsync(
    faceIdCredentialKey(credential.userId),
    JSON.stringify({ ...credential, phone: credential.phone || undefined }),
    biometricCredentialOptions,
  );
  const account: FaceIdLoginAccount = {
    credentialId: credential.credentialId,
    email: credential.email,
    phone: credential.phone || undefined,
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
  password: string,
  otp?: string,
): Promise<void> {
  let deviceId = await secureStoreAdapter.getItem(
    "healthapp.biometric-device-id",
  );
  if (!deviceId) {
    deviceId = createUuid();
    await secureStoreAdapter.setItem("healthapp.biometric-device-id", deviceId);
  }
  const { data, error } = await supabase.functions.invoke("biometric-auth", {
    body: {
      action: "enroll",
      userId: account.userId,
      password,
      otp,
      deviceId,
      deviceName: "iPhone",
    },
  });
  const enrollment = parseBiometricEnrollmentResponse(data);
  if (error || !enrollment) {
    const failure = await biometricFunctionError(error);
    if (failure.status === 400)
      throw new Error(
        "Reload or update HealthApp, then enable Face ID again using your current password.",
      );
    if (failure.code === "reauthentication_required")
      throw new Error(
        otp
          ? "That phone code could not be verified. Request a fresh code and try again."
          : "Your password could not be verified. Enter your current password to enable Face ID.",
      );
    throw new Error("Could not register this iPhone for Face ID sign-in.");
  }
  await saveFaceIdLoginCredential({ ...account, ...enrollment, deviceId });
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

async function waitForBiometricForeground(): Promise<boolean> {
  if (AppState.currentState === "active") return true;
  if (AppState.currentState === "background") return false;
  return new Promise((resolve) => {
    const finish = (active: boolean) => {
      clearTimeout(timeout);
      subscription.remove();
      resolve(active);
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") finish(true);
      else if (state === "background") finish(false);
    });
    // A missing native foreground event must not leave the login cover stuck.
    const timeout = setTimeout(() => finish(false), 10_000);
    // Recheck after subscribing so an intervening foreground event is not lost.
    if (AppState.currentState === "active") finish(true);
    else if (AppState.currentState === "background") finish(false);
  });
}

export async function signInWithFaceIdCredential(): Promise<FaceIdAuthenticationResult> {
  const marker = await getFaceIdLoginAccount();
  if (marker && !marker.email)
    return {
      success: false,
      message:
        "Use a phone code to sign in. Face ID protects this phone while you are signed in.",
    };
  const credential = await getFaceIdLoginCredential();
  if (!credential?.deviceId) {
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
      deviceId: credential.deviceId,
    },
  });
  const response = parseBiometricSessionResponse(data);
  if (error || !response || response.userId !== credential.userId) {
    return faceIdLoginFailure(await biometricFunctionError(error));
  }
  // Persist the rotated secret before accepting the new session. A lost response
  // fails closed; the old secret can never mint another session.
  await saveFaceIdLoginCredential({
    ...credential,
    secret: response.nextSecret,
  });
  // iOS can resolve the protected Keychain read before reporting active again.
  // Publishing SIGNED_IN during that interval locks the new session and cancels
  // entry, leaving an authenticated user stranded on the sign-in screen.
  if (!(await waitForBiometricForeground())) {
    return {
      success: false,
      message:
        "Face ID sign-in was interrupted. Try again or use your password.",
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
  if (Platform.OS !== "web")
    await SecureStore.deleteItemAsync(faceIdCredentialKey(userId));
  else await secureStoreAdapter.removeItem(faceIdCredentialKey(userId));
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
