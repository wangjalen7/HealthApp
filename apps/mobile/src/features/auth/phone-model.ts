import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  AsYouType,
  type CountryCode,
} from "libphonenumber-js";
export { getCountries, getCountryCallingCode, type CountryCode };
export function normalizedPhone(value: string, country: CountryCode) {
  const parsed = parsePhoneNumberFromString(value, country);
  if (!parsed?.isValid())
    throw Error("Enter a valid phone number for the selected country.");
  return parsed.number;
}
export function formattedPhone(value: string, country: CountryCode) {
  return new AsYouType(country).input(value);
}
export function otpDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}
export function authIssue(error: unknown) {
  const e = error as { code?: string; status?: number; message?: string };
  if (e?.status === 429 || /rate|too_many|over_.*limit/.test(e?.code ?? ""))
    return "Too many attempts. Wait a little before trying again.";
  if (/otp_expired|invalid_credentials/.test(e?.code ?? ""))
    return "That code is incorrect or expired. Check it or request a new code.";
  if (/exists|already|conflict/.test(e?.code ?? ""))
    return "That contact may belong to another account. Sign in to that account instead; accounts cannot be merged here.";
  if (
    /phone_provider_disabled|sms_send_failed|provider|unexpected_failure/.test(
      e?.code ?? "",
    ) ||
    /SMS|provider|phone.*disabled/i.test(e?.message ?? "")
  )
    return "Text messages are unavailable right now. Use email to continue, or try again later.";
  return (
    e?.message || "Could not connect. Check your connection and try again."
  );
}
// Must match Supabase auth.sms.max_frequency; Auth remains authoritative.
export const smsResendSeconds = 60;
