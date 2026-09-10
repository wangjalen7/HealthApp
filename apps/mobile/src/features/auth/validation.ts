import { z } from "zod";

export function validateAuthInput(
  mode: "signIn" | "signUp" | "reset",
  email: string,
  password: string,
): string | undefined {
  if (!z.email().safeParse(email.trim()).success)
    return "Enter a valid email address.";
  if (mode === "signIn" && !password) return "Enter your password.";
  if (mode === "signUp" && password.length < 8)
    return "Use a password of at least 8 characters.";
  return undefined;
}
