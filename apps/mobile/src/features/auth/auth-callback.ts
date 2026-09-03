export type AuthCallback = {
  accessToken?: string;
  code?: string;
  refreshToken?: string;
  type?: string;
};

export function authCallbackFromUrl(url: string): AuthCallback {
  const parsed = new URL(url);
  const parameters = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  fragment.forEach((value, key) => parameters.set(key, value));
  return {
    accessToken: parameters.get("access_token") ?? undefined,
    code: parameters.get("code") ?? undefined,
    refreshToken: parameters.get("refresh_token") ?? undefined,
    type: parameters.get("type") ?? undefined,
  };
}

export function isDuplicateSignUpResponse(
  identities: readonly unknown[] | undefined,
): boolean {
  return Array.isArray(identities) && identities.length === 0;
}
