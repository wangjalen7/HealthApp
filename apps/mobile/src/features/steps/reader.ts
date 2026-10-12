import type { StepBucket } from "./model";
export async function stepAvailability() {
  return {
    available: false,
    reason: "Apple Health steps are available in the iPhone app.",
  };
}
export async function authorizeSteps(): Promise<void> {
  throw Error("Open Sustain on your iPhone to connect Apple Health.");
}
export async function readStepBuckets(
  start: Date,
  end: Date,
  hourly: boolean,
): Promise<StepBucket[]> {
  void start;
  void end;
  void hourly;
  throw Error("Apple Health steps are available in the iPhone app.");
}
