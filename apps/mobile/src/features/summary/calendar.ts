// Calendar arithmetic deliberately uses local constructors/setDate, including DST.
export { localDay as dayKey, dateFromLocalDay } from "../reminders/model";
import { localDay, dateFromLocalDay } from "../reminders/model";
export function shiftDay(key: string, amount: number): string {
  const date = dateFromLocalDay(key, "12:00");
  date.setDate(date.getDate() + amount);
  return localDay(date);
}
export function monday(key: string): string {
  return shiftDay(key, -((dateFromLocalDay(key).getDay() + 6) % 7));
}
export function dayBounds(key: string) {
  return {
    start: dateFromLocalDay(key, "00:00"),
    end: dateFromLocalDay(shiftDay(key, 1), "00:00"),
  };
}
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
