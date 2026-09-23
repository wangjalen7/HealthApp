import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  defaultRoutines,
  routineSchema,
  parseRoutinePreferences,
  type RoutinePreferences,
} from "./routine-model";
export const routineKey = (user: string) => `healthapp:routines:v1:${user}`;
export async function loadRoutines(user: string): Promise<RoutinePreferences> {
  const raw = await AsyncStorage.getItem(routineKey(user));
  if (!raw) return defaultRoutines(user);
  const parsed = parseRoutinePreferences(JSON.parse(raw));
  if (parsed.userId !== user)
    throw Error("These reminder settings belong to another account.");
  return parsed;
}
export async function storeRoutines(p: RoutinePreferences) {
  await AsyncStorage.setItem(
    routineKey(p.userId),
    JSON.stringify(routineSchema.parse(p)),
  );
}
