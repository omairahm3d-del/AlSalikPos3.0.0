/**
 * Product CSV export / import helpers for the POS app (offline-first).
 * Export: reads local products → CSV → share sheet (native) or download (web).
 * Import: picks a CSV file → parses rows → returns typed ProductCsvRow[].
 *         Actual DB upsert is done by the caller so it runs inside the right context.
 */
import { Platform } from "react-native";
import type { Product } from "@/types";
import { buildCsv, downloadCsv } from "./csvExport";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ProductCsvRow {
  name: string;
  category: string;
  price: number;
  barcode: string;
  description: string;
  stockQuantity: number;
  stockTracked: boolean;
  vatInclusive: boolean;
  lowStockThreshold: number;
  colorHex: string;
}

/* -------------------------------------------------------------------------- */
/* Column order (kept stable so imports always match exports)                  */
/* -------------------------------------------------------------------------- */

const HEADERS = [
  "Name",
  "Category",
  "Price",
  "Barcode",
  "Description",
  "StockQuantity",
  "StockTracked",
  "VATInclusive",
  "LowStockThreshold",
  "ColorHex",
];

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

function productToRow(p: Product): Record<string, string | number> {
  return {
    Name: p.name,
    Category: p.category,
    Price: p.price,
    Barcode: p.barcode ?? "",
    Description: p.description ?? "",
    StockQuantity: p.stockQuantity,
    StockTracked: p.stockTracked ? "true" : "false",
    VATInclusive: p.vatInclusive ? "true" : "false",
    LowStockThreshold: p.lowStockThreshold ?? 5,
    ColorHex: p.colorHex ?? "#6B7280",
  };
}

const TEMPLATE_ROW: Record<string, string | number> = {
  Name: "Sample Product",
  Category: "Coffee",
  Price: 15,
  Barcode: "",
  Description: "An example product — delete this row before importing",
  StockQuantity: 0,
  StockTracked: "false",
  VATInclusive: "false",
  LowStockThreshold: 5,
  ColorHex: "#6B7280",
};

export async function exportProductsCsv(
  products: Product[],
): Promise<{ ok: boolean; error?: string }> {
  const rows = products.length > 0 ? products.map(productToRow) : [TEMPLATE_ROW];
  const csv = buildCsv(rows, HEADERS);
  return downloadCsv("products", csv);
}

/* -------------------------------------------------------------------------- */
/* CSV parser (handles quoted fields + BOM)                                    */
/* -------------------------------------------------------------------------- */

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseRawCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const rawHeaders = splitCsvLine(lines[0]!);
  const headers = rawHeaders.map((h) => h.trim().replace(/^\uFEFF/, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const vals = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function rawToProductRow(raw: Record<string, string>): ProductCsvRow | null {
  const name = (raw.Name ?? raw.name ?? "").trim();
  if (!name) return null;
  return {
    name,
    category: (raw.Category ?? raw.category ?? "").trim(),
    price: parseFloat(raw.Price ?? raw.price ?? "0") || 0,
    barcode: (raw.Barcode ?? raw.barcode ?? "").trim(),
    description: (raw.Description ?? raw.description ?? "").trim(),
    stockQuantity: parseInt(raw.StockQuantity ?? raw.stockQuantity ?? "0", 10) || 0,
    stockTracked: (raw.StockTracked ?? raw.stockTracked ?? "").toLowerCase() === "true",
    vatInclusive: (raw.VATInclusive ?? raw.vatInclusive ?? "").toLowerCase() === "true",
    lowStockThreshold: parseInt(raw.LowStockThreshold ?? raw.lowStockThreshold ?? "5", 10) || 5,
    colorHex: (raw.ColorHex ?? raw.colorHex ?? "#6B7280").trim() || "#6B7280",
  };
}

/* -------------------------------------------------------------------------- */
/* Import — pick file + parse                                                  */
/* -------------------------------------------------------------------------- */

async function readNativeFileText(uri: string): Promise<string> {
  // @ts-ignore optional native module
  const FS: any = await import("expo-file-system").catch(() => null);
  if (!FS) throw new Error("expo-file-system not available");
  return FS.readAsStringAsync(uri, { encoding: FS.EncodingType?.UTF8 ?? "utf8" });
}

export async function pickProductsCsv(): Promise<{
  ok: boolean;
  rows?: ProductCsvRow[];
  error?: string;
}> {
  let csvText: string;

  if (Platform.OS === "web") {
    const result = await new Promise<{ ok: boolean; text?: string; error?: string }>(
      (resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "text/csv,.csv";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve({ ok: false, error: "No file selected" });
            return;
          }
          try {
            resolve({ ok: true, text: await file.text() });
          } catch (e: any) {
            resolve({ ok: false, error: e?.message ?? "Could not read file" });
          }
        };
        input.click();
        setTimeout(() => resolve({ ok: false }), 60_000);
      },
    );
    if (!result.ok) return { ok: false, error: result.error };
    csvText = result.text!;
  } else {
    // @ts-ignore optional native module
    const Picker: any = await import("expo-document-picker").catch(() => null);
    if (!Picker) return { ok: false, error: "Document picker not available on this device" };
    const res = await Picker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return { ok: false };
    try {
      csvText = await readNativeFileText(res.assets[0].uri);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Could not read file" };
    }
  }

  const raw = parseRawCsv(csvText);
  if (raw.length === 0) return { ok: false, error: "CSV is empty or contains no data rows." };

  const firstRow = raw[0] ?? {};
  const hasName = "Name" in firstRow || "name" in firstRow;
  const hasPrice = "Price" in firstRow || "price" in firstRow;
  if (!hasName || !hasPrice) {
    return {
      ok: false,
      error: 'CSV must have "Name" and "Price" columns. Export existing products or download a template first.',
    };
  }

  const rows = raw.map(rawToProductRow).filter((r): r is ProductCsvRow => r !== null);
  if (rows.length === 0)
    return { ok: false, error: "No valid rows found — Name column must not be empty." };

  return { ok: true, rows };
}
