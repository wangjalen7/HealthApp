/** Bump when the disclosed provider, purpose or transmitted categories change. */
export const aiConsentVersion = "2026-09-25.1";

/** Defense in depth: structured account/record identifiers and locations are not AI inputs.
 * Free text can still contain identifying details supplied by the user.
 */
export function minimizeAiContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(minimizeAiContext);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/^(id|user_?id|session_?id|email|phone|first_?name|last_?name|display_?name|location|external_?id|source_?name|object_?path|signed_?url)$/i.test(key),
  ).map(([key,item]) => [key,minimizeAiContext(item)]));
}
