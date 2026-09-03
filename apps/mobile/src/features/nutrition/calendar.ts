export type DailyCalorieTotal = {
  calories: number;
  entryCount: number;
};

export type CalorieCalendarCell = {
  day: number;
  dateKey: string;
};

export function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfCalendarMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function shiftCalendarMonth(value: Date, offset: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + offset, 1);
}

export function calorieTotalsByLocalDay(
  entries: { occurredAt: string; calories: number }[],
): Record<string, DailyCalorieTotal> {
  const totals: Record<string, DailyCalorieTotal> = {};
  for (const entry of entries) {
    const key = localDateKey(new Date(entry.occurredAt));
    const current = totals[key] ?? { calories: 0, entryCount: 0 };
    totals[key] = {
      calories: current.calories + entry.calories,
      entryCount: current.entryCount + 1,
    };
  }
  return totals;
}

export function calorieCalendarCells(
  reference: Date,
): (CalorieCalendarCell | null)[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (CalorieCalendarCell | null)[] = Array.from(
    { length: first.getDay() },
    () => null,
  );
  for (let day = 1; day <= days; day += 1) {
    cells.push({ day, dateKey: localDateKey(new Date(year, month, day)) });
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
