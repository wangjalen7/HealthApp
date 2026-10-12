import { healthKitAvailability } from "../healthkit/reader";
import { healthKitReadAuthorizationTypes } from "../healthkit/permissions";
import { normalizeStepStatistics } from "./model";
export const stepAvailability = healthKitAvailability;
async function healthKit() {
  const status = await stepAvailability();
  if (!status.available) throw Error(status.reason);
  return import("@kingstinct/react-native-healthkit");
}
export async function authorizeSteps() {
  const hk = await healthKit();
  await hk.requestAuthorization({
    toRead: [...healthKitReadAuthorizationTypes],
  });
}
export async function readStepBuckets(start: Date, end: Date, hourly: boolean) {
  const hk = await healthKit();
  const now = new Date();
  const statistics = await hk.queryStatisticsCollectionForQuantity(
    "HKQuantityTypeIdentifierStepCount",
    ["cumulativeSum"],
    start,
    hourly ? { hour: 1 } : { day: 1 },
    {
      unit: "count",
      filter: {
        date: {
          startDate: start,
          endDate: new Date(Math.min(end.getTime(), now.getTime())),
        },
      },
    },
  );
  return normalizeStepStatistics(statistics, start, end, hourly, now);
}
