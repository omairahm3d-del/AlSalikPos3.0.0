/**
 * Weight-scale barcode helpers for retail mode.
 *
 * Most UAE / GCC retail chains use EAN-13 barcodes with an embedded weight or
 * price for loose goods such as produce, deli meats, and bulk items.
 *
 * Standard layout (13 digits):
 *   [PP] [NNNNN] [VVVVV] [C]
 *    PP    = 2-digit in-store prefix (20–29, reserved by GS1 for in-store use)
 *    NNNNN = 5-digit PLU / item number
 *    VVVVV = 5-digit encoded value (weight in grams OR price in fils/cents)
 *    C     = EAN-13 check digit
 *
 * Example – weight encoding:  2 1 0 0 0 1 5 0 1 2 5 0 5
 *   prefix=21  plu=00015  value=01250 → 1.250 kg
 *
 * Example – price encoding:   2 8 0 0 0 1 5 0 9 9 9 9 C
 *   prefix=28  plu=00015  value=09999 → 99.99 AED
 *
 * Setup: set a product's "Barcode" field to its 5-digit PLU code (e.g. "00015").
 * When the scanner reads a matching weight barcode the POS will find the product
 * by PLU and add it with the decoded weight (kg) as the cart quantity.
 */

import type { WeightBarcodeSettings } from "@/types";

export interface WeightBarcodeResult {
  /** 5-digit PLU / item code extracted from digits 3–7 of the barcode. */
  plu: string;
  /** Kg when encoding === "weight". Absent for price-encoded barcodes. */
  weightKg?: number;
  /** AED when encoding === "price". Absent for weight-encoded barcodes. */
  priceAed?: number;
}

/**
 * Returns true when the 13-digit barcode has one of the configured
 * weight-scale prefixes. Does NOT validate the EAN-13 check digit.
 */
export function isWeightBarcode(barcode: string, prefixes: string[]): boolean {
  if (barcode.length !== 13) return false;
  return prefixes.includes(barcode.slice(0, 2));
}

/**
 * Parses a 13-digit weight-scale EAN-13 barcode.
 * Returns null when the barcode does not match the configured prefixes
 * or the value field cannot be parsed.
 */
export function parseWeightBarcode(
  barcode: string,
  settings: WeightBarcodeSettings,
): WeightBarcodeResult | null {
  if (barcode.length !== 13) return null;
  if (!settings.prefixes.includes(barcode.slice(0, 2))) return null;

  const plu = barcode.slice(2, 7);                     // digits 3–7  (PLU)
  const rawValue = parseInt(barcode.slice(7, 12), 10); // digits 8–12 (value)
  if (isNaN(rawValue)) return null;

  if (settings.encoding === "weight") {
    const divisor = settings.weightDivisor > 0 ? settings.weightDivisor : 1000;
    return { plu, weightKg: rawValue / divisor };
  }

  // Price encoding: raw value is price in fils (1/100 AED)
  return { plu, priceAed: rawValue / 100 };
}
