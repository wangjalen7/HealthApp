import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "./auth-provider";
import { supabase } from "../../lib/supabase";
import { assertAccount } from "../../lib/mutations";
import { CodeInput, ResendCode } from "./code-input";
import { authIssue, smsResendSeconds } from "./phone-model";
import { verifyContact } from "./contact-service";
import {
  SetupButton,
  SetupField,
  SetupError,
  ui,
} from "../onboarding/components";
export function AccountContacts({
  recoveryOnly = false,
  onDirtyChange,
  onBusyChange,
}: {
  recoveryOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { session } = useAuth();
  const user = session?.user;
  const [value, setValue] = useState(""),
    [destination, setDestination] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false),
    [availableAt, setAvailableAt] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    onDirtyChange?.(Boolean(value || code || sent));
  }, [value, code, sent, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  async function send() {
    if (!user || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      await assertAccount(user.id);
      const contact = value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
        throw Error("Enter a valid email address.");
      const { data, error } = await supabase.auth.updateUser({
        email: contact,
      });
      if (error) throw error;
      if (data.user?.id !== user.id)
        throw Error("Account changed. Sign in again.");
      setDestination(contact);
      setCode("");
      setSent(true);
      setAvailableAt(Date.now() + smsResendSeconds * 1000);
    } catch (e) {
      setMessage(authIssue(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (!user || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await verifyContact(user.id, "email", destination, code);
      setCode("");
      setSent(false);
      setValue("");
      setSuccess(true);
      setMessage(
        "Email verified. You can use email password recovery to set or reset your password.",
      );
    } catch (e) {
      setMessage(authIssue(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function checkEmail() {
    if (!user || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await assertAccount(user.id);
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (
        data.user.id !== user.id ||
        data.user.email?.toLowerCase() !== destination.toLowerCase() ||
        !data.user.email_confirmed_at
      )
        throw Error(
          "Email verification is still pending. Check the messages sent to both addresses when changing an email.",
        );
      await supabase.auth.refreshSession();
      setCode("");
      setValue("");
      setSent(false);
      setSuccess(true);
      setMessage(
        "Email verified. You can now use email password recovery to set or reset your password.",
      );
    } catch (e) {
      setMessage(authIssue(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!user) return null;
  return (
    <View style={{ gap: 15 }}>
      <Text style={ui.label}>
        {recoveryOnly ? "Add a recovery email" : "Account email"}
      </Text>
      <Text style={ui.copy}>
        {recoveryOnly
          ? "Optional. Verify an email so you can recover access to your account."
          : "Keep your sign-in email up to date. Changing it keeps your account and health records together."}
      </Text>
      {!recoveryOnly ? (
        <>
          <Text style={ui.caption}>
            Email: {user.email || "Not added"}
            {user.email_confirmed_at ? " · Verified" : " · Unverified"}
          </Text>
        </>
      ) : null}
      {sent ? (
        <>
          <Text style={ui.copy}>
            Enter the code sent to {destination}. If changing an existing email,
            confirm both addresses.
          </Text>
          <>
            <Text style={ui.copy}>
              If your email contains a confirmation link instead, open it and
              then check its status here.
            </Text>
            <SetupButton
              secondary
              label="Check email verification"
              disabled={busy}
              onPress={() => void checkEmail()}
            />
          </>
          <CodeInput value={code} onChange={setCode} busy={busy} />
          <SetupButton
            label={busy ? "Verifying..." : "Verify email"}
            disabled={busy || code.length !== 6}
            onPress={() => void verify()}
          />
          <ResendCode
            availableAt={availableAt}
            onResend={() => void send()}
            busy={busy}
          />
          <SetupButton
            label="Edit contact"
            secondary
            disabled={busy}
            onPress={() => {
              setSent(false);
              setCode("");
            }}
          />
        </>
      ) : (
        <>
          <SetupField
            label="Email to verify"
            value={value}
            onChangeText={setValue}
          />
          <SetupButton
            label={busy ? "Sending..." : "Send verification code"}
            disabled={busy || !value.trim()}
            onPress={() => void send()}
          />
        </>
      )}
      {success ? (
        <Text accessibilityLiveRegion="polite" style={ui.copy}>
          {message}
        </Text>
      ) : (
        <SetupError message={message} />
      )}
    </View>
  );
}
