import type { ScheduleRequest } from "./schedule-model";
export function privateNotificationPreviews(
  requests: ScheduleRequest[],
  detailed: boolean,
): ScheduleRequest[] {
  if (detailed) return requests;
  return requests.map((r) => {
    const next = {
      ...r,
      title: "Sustain reminder",
      body: "Open Sustain to view your reminder.",
    };
    // Do not retain the original sensitive title in the fingerprint payload.
    const { fingerprint: _previous, ...content } = next;
    void _previous;
    return { ...next, fingerprint: JSON.stringify(content) };
  });
}
