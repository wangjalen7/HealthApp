import { router, Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";
import {
  finishWelcomeIntro,
  useWelcomeSeen,
} from "../../src/features/auth/welcome-intro";
import { useAuth } from "../../src/features/auth/auth-provider";
import {
  SetupButton,
  SetupFrame,
} from "../../src/features/onboarding/components";
import { SustainBrand } from "../../src/features/auth/sustain-brand";
export default function Welcome() {
  const { session } = useAuth();
  const seen = useWelcomeSeen();
  if (session) return <Redirect href="/" />;
  if (seen === undefined) return <ActivityIndicator />;
  if (seen) return <Redirect href="/(auth)/sign-in" />;
  async function continueTo(path: "/(auth)/sign-up" | "/(auth)/sign-in") {
    await finishWelcomeIntro().catch(() => undefined);
    router.replace(path);
  }
  return (
    <SetupFrame
      title="Your health, in one place."
      copy="Track meals, workouts, fluids, and health trends. Build a routine that fits your life."
      footer={
        <>
          <SetupButton
            label="Continue with email"
            onPress={() => void continueTo("/(auth)/sign-up")}
          />
          <SetupButton
            label="Already have an account? Sign in"
            secondary
            onPress={() => void continueTo("/(auth)/sign-in")}
          />
        </>
      }
    >
      <SustainBrand size={112} />
    </SetupFrame>
  );
}
