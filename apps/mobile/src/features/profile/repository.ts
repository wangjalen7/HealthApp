import { z } from "zod";

import { supabase } from "../../lib/supabase";
import { assertAccount } from "../../lib/mutations";

const profileNameSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
});

export type ProfileName = z.infer<typeof profileNameSchema>;

export async function getProfileName(
  userId: string,
): Promise<Partial<ProfileName>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return {
    firstName:
      typeof data.first_name === "string" && data.first_name.trim()
        ? data.first_name.trim()
        : undefined,
    lastName:
      typeof data.last_name === "string" && data.last_name.trim()
        ? data.last_name.trim()
        : undefined,
  };
}

export async function saveProfileName(
  userId: string,
  input: ProfileName,
): Promise<ProfileName> {
  const name = profileNameSchema.parse(input);
  await assertAccount(userId);
  const displayName = `${name.firstName} ${name.lastName}`;
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      first_name: name.firstName,
      last_name: name.lastName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  await assertAccount(userId);
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      display_name: displayName,
      first_name: name.firstName,
      last_name: name.lastName,
    },
  });
  if (authError) throw new Error(authError.message);
  await assertAccount(userId);
  return name;
}
