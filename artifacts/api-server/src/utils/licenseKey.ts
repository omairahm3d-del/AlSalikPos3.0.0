import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function group(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) {
    const byte = bytes[i] ?? 0;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export function generateLicenseKey(prefix = "ALSK"): string {
  return [prefix, group(4), group(4), group(4), group(4)].join("-");
}

export function normalizeLicenseKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
