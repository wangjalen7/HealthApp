export type BarcodeType = "ean13" | "ean8" | "upc_a" | "upc_e" | "unknown";

export type NormalizedBarcode = {
  canonical: string;
  providerBarcode: string;
};

export function checkDigitValid(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  const digits = [...code].map(Number);
  const expected = digits.pop();
  let sum = 0;
  for (let index = digits.length - 1, position = 0; index >= 0; index--, position++) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === expected;
}

export function expandUpce(code: string): string | undefined {
  if (!/^\d{8}$/.test(code)) return undefined;
  const [numberSystem, d1, d2, d3, d4, d5, d6, check] = code;
  let body: string;
  if (["0", "1", "2"].includes(d6)) {
    body = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  } else if (d6 === "3") {
    body = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}`;
  } else if (d6 === "4") {
    body = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}`;
  } else {
    body = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }
  const expanded = `${body}${check}`;
  return expanded.length === 12 && checkDigitValid(expanded) ? expanded : undefined;
}

function normalizedUpce(digits: string): NormalizedBarcode | undefined {
  const providerBarcode = digits.length === 7 ? `0${digits}` : digits;
  const expanded = expandUpce(providerBarcode);
  return expanded
    ? { canonical: providerBarcode.padStart(14, "0"), providerBarcode }
    : undefined;
}

export function normalizeBarcode(
  raw: string,
  type: BarcodeType,
): NormalizedBarcode | undefined {
  const digits = raw.replace(/\D/g, "");
  if (type === "upc_e") return normalizedUpce(digits);
  if (![7, 8, 12, 13].includes(digits.length)) return undefined;
  if (checkDigitValid(digits)) {
    return { canonical: digits.padStart(14, "0"), providerBarcode: digits };
  }
  // Manual entry has no symbology selector. An eight-digit value that is not
  // a valid EAN-8 may still be a UPC-E, whose check digit is calculated after
  // expanding it to UPC-A. OFF receives the original compressed code and
  // performs its documented leading-zero normalization.
  if (type === "unknown" && (digits.length === 7 || digits.length === 8)) {
    return normalizedUpce(digits);
  }
  return undefined;
}
