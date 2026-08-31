// Blood pressure is authorized through its two quantity types. Including the
// correlation type in the same iOS 26 authorization set can raise a synchronous
// Objective-C exception even though correlation queries remain supported.
export const healthKitReadAuthorizationTypes = [
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierBloodPressureSystolic",
  "HKQuantityTypeIdentifierBloodPressureDiastolic",
] as const;
