import { supabase } from "../../lib/supabase";
import { assertAccount } from "../../lib/mutations";
import { createUuid } from "../../lib/id";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setupSchema, type AccountSetup, type SetupChanges } from "./model";
export async function getAccountSetup(userId: string) {
  await assertAccount(userId);
  const { data, error } = await supabase
    .from("account_setup")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error)
    throw new Error(
      "Could not load your account setup. Your saved data is safe. Try again.",
    );
  return setupSchema.parse(data);
}
export async function saveAccountSetup(
  previous: AccountSetup,
  changes: SetupChanges,
) {
  await assertAccount(previous.user_id);
  const key = "healthapp:setup-write:" + previous.user_id;
  const request = {
    p_user_id: previous.user_id,
    p_version: previous.version,
    p_changes: changes,
  };
  const pending = await AsyncStorage.getItem(key);
  let operationId = createUuid();
  if (pending) {
    const saved = JSON.parse(pending);
    if (JSON.stringify(saved.request) !== JSON.stringify(request))
      throw new Error(
        "A setup save is still pending. Retry that save before making more changes.",
      );
    operationId = saved.operationId;
  } else
    await AsyncStorage.setItem(key, JSON.stringify({ request, operationId }));
  const { data, error } = await supabase.rpc("save_account_setup", {
    ...request,
    p_operation_id: operationId,
  });
  if (error)
    throw new Error(
      "Could not confirm your setup save. Retry to safely check it.",
    );
  if (data?.status === "conflict") {
    await AsyncStorage.removeItem(key);
    throw new Error(
      "Settings changed on another device. Reload the latest settings before continuing.",
    );
  }
  if (data?.status !== "accepted")
    throw new Error("Could not confirm your setup save. Please retry.");
  setupSchema.parse(data.data);
  await AsyncStorage.removeItem(key);
  return getAccountSetup(previous.user_id);
}
export async function resumeSetupWrite(userId: string) {
  const key = "healthapp:setup-write:" + userId;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;
  await assertAccount(userId);
  const { request, operationId } = JSON.parse(raw);
  if (request.p_user_id !== userId) throw new Error("Account changed.");
  const { data, error } = await supabase.rpc("save_account_setup", {
    ...request,
    p_operation_id: operationId,
  });
  if (error || !["accepted", "conflict"].includes(data?.status))
    throw new Error("A setup save is pending. Connect and retry.");
  await AsyncStorage.removeItem(key);
}
