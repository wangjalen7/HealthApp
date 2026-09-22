/** The verifier must call Auth with the supplied password on the server. This
 * check is deliberately independent of the caller's existing bearer session. */
export async function verifyEnrollmentPassword<
  T extends {
    user: { id: string } | null;
    session: { access_token: string } | null;
  },
>(
  expectedUserId: string,
  password: string,
  verify: (password: string) => Promise<{ data: T; error: unknown }>,
): Promise<T | undefined> {
  if (!password || password.length > 1024) return undefined;
  const result = await verify(password);
  if (
    result.error ||
    !result.data.session ||
    result.data.user?.id !== expectedUserId
  )
    return undefined;
  return result.data;
}

/** Verify a fresh SMS code against Supabase on the server, bound to the bearer user. */
export async function verifyEnrollmentOtp<
  T extends {
    user: { id: string } | null;
    session: { access_token: string } | null;
  },
>(
  expectedUserId: string,
  otp: string,
  verify: (otp: string) => Promise<{ data: T; error: unknown }>,
): Promise<T | undefined> {
  if (!/^\d{6}$/.test(otp)) return undefined;
  const result = await verify(otp);
  if (
    result.error ||
    !result.data.session ||
    result.data.user?.id !== expectedUserId
  )
    return undefined;
  return result.data;
}
