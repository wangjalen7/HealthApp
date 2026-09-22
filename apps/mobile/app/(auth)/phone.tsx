import { Redirect } from "expo-router";

// Keep old links usable while phone authentication is unavailable.
export default function PhoneEntry() {
  return <Redirect href="/(auth)/sign-in" />;
}
