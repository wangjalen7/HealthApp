// Auth owns the explicit sign-out boundary. The mounted notification observer
// registers device work without pulling native notification modules into auth.
const handlers = new Set<(user: string) => Promise<void>>();
export function observeReminderSignOut(
  handler: (user: string) => Promise<void>,
) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
export async function prepareReminderSignOut(user: string) {
  for (const handler of handlers) await handler(user);
}
