export type MappedCardioActivityType =
  | "walk"
  | "run"
  | "swim"
  | "tennis"
  | "cycle"
  | "other";

const cardioTypeByWorkout: Record<
  number,
  MappedCardioActivityType
> = {
  13: "cycle",
  14: "other",
  16: "other",
  24: "other",
  30: "other",
  31: "other",
  35: "other",
  37: "run",
  43: "other",
  46: "swim",
  48: "tennis",
  52: "walk",
  63: "other",
  64: "other",
  68: "other",
  69: "other",
  70: "walk",
  71: "run",
  73: "other",
  74: "cycle",
  76: "other",
  77: "other",
  82: "other",
};

export function cardioTypeForWorkout(
  activityType: number,
): MappedCardioActivityType | undefined {
  return cardioTypeByWorkout[activityType];
}

export function pressureInMmHg(value: number, unit: string): number {
  if (unit === "kPa") return value * 7.50062;
  if (unit === "inHg") return value * 25.4;
  return value;
}

export function distanceInMiles(
  value: number,
  unit: string,
): number | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  if (unit === "mi") return value;
  if (unit === "km") return value * 0.621371;
  if (unit === "m") return value * 0.000621371;
  if (unit === "yd") return value / 1760;
  if (unit === "ft") return value / 5280;
  return undefined;
}

export function durationInMinutes(value: number, unit: string): number {
  if (unit === "min") return value;
  if (unit === "hr") return value * 60;
  return value / 60;
}

export function readableActivityName(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}
