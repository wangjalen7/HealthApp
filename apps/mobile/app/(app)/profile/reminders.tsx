import { Redirect } from "expo-router";

// Keep old links working through the shared Track destination.
export default function ProfileReminders() {
  return <Redirect href="/reminders" />;
}
