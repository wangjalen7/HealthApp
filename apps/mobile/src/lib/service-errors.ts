export function serviceErrorMessage(
  error: unknown,
  fallback = "Could not load data.",
): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : fallback;
  if (
    /column .*\.version does not exist/i.test(message) ||
    /Could not find the function public\.(read_vital_changes|commit_health_mutation|require_active_session)/i.test(
      message,
    )
  )
    return "A required service update is pending. Your saved data and pending changes are retained. Try again after the service is updated.";
  return message;
}
