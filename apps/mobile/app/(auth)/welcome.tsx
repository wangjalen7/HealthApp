import { router, Redirect } from "expo-router";
import { useAuth } from "../../src/features/auth/auth-provider";
import {
  SetupButton,
  SetupFrame,
} from "../../src/features/onboarding/components";
import { WelcomeArtwork } from "../../src/features/onboarding/artwork";
export default function Welcome() {
  const { session } = useAuth();
  if (session) return <Redirect href="/" />;
  return (
    <SetupFrame
      title="Your health, in one place."
      copy="Track meals, workouts, fluids, and health trends. Build a routine that fits your life."
      footer={
        <>
          <SetupButton
            label="Continue with email"
            onPress={() => router.push("/(auth)/sign-up")}
          />
          <SetupButton
            label="Already have an account? Sign in"
            secondary
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </>
      }
    >
      <WelcomeArtwork />
    </SetupFrame>
  );
}
