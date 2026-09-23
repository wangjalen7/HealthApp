import { useEffect, useState } from "react";
import { Text } from "react-native";
import { DetailScreen, styles } from "./settings-ui";
import { useAuth } from "../auth/auth-provider";
import { AccountContacts } from "../auth/account-contacts";
import { FaceIdSetup } from "../auth/face-id-setup";
import { SecuritySettings } from "../auth/security-settings";
import { DeleteAccountSection } from "../auth/account-deletion";
import { useUnsavedChanges } from "./use-unsaved-changes";
export function ContactsScreen() {
  const { session } = useAuth();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useUnsavedChanges(dirty, busy);
  return (
    <DetailScreen title="Sign-in & Contact Info">
      {session?.user.phone ? (
        <Text style={styles.copy}>
          Phone: {session.user.phone} ·{" "}
          {session.user.phone_confirmed_at ? "Verified" : "Unverified"}. Phone
          changes are not currently supported.
        </Text>
      ) : null}
      <AccountContacts onDirtyChange={setDirty} onBusyChange={setBusy} />
      {guard.confirmation}
    </DetailScreen>
  );
}
export function FaceIdScreen() {
  const { refreshFaceIdAvailability } = useAuth();
  useEffect(() => {
    void refreshFaceIdAvailability();
  }, [refreshFaceIdAvailability]);
  return (
    <DetailScreen title="Face ID">
      <FaceIdSetup />
    </DetailScreen>
  );
}
export function DevicesScreen() {
  const { session } = useAuth();
  return (
    <DetailScreen title="Enrolled Devices">
      {session ? <SecuritySettings userId={session.user.id} /> : null}
    </DetailScreen>
  );
}
export function ManageAccountScreen() {
  const { session } = useAuth();
  return (
    <DetailScreen title="Manage Account">
      {session ? <DeleteAccountSection user={session.user.id} /> : null}
    </DetailScreen>
  );
}
