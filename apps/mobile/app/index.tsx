import { Redirect } from "expo-router";
import { useEffect } from "react";
import { SustainLoading, useEntry } from "../src/features/auth/entry-provider";

import { useAuth } from "../src/features/auth/auth-provider";
import { SignedOutEntry } from "../src/features/auth/welcome-intro";
import { useAccountDeletion } from "../src/features/auth/account-deletion";

export default function Index() {
  const { pending } = useAccountDeletion();
  const { configured, loading, session } = useAuth();
  const entry = useEntry();
  const { biometricLocked } = useAuth();
  useEffect(() => {
    if (loading || !session || biometricLocked || entry.attempt) return;
    const id = entry.begin("restore");
    entry.complete(id, session.user.id);
  }, [loading, session, biometricLocked, entry]);
  if (loading) return <SustainLoading />;
  if (configured && session)
    return biometricLocked ? <Redirect href="/(app)" /> : <SustainLoading />;
  return pending ? <Redirect href="/(auth)/sign-in" /> : <SignedOutEntry />;
}
