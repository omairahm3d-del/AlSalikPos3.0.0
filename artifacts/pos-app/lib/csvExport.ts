import { Platform } from "react-native";

export type CsvRow = Record<string, string | number | undefined | null>;

function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(rows: CsvRow[], headers?: string[]): string {
  if (rows.length === 0 && (!headers || headers.length === 0)) return "";
  const cols = headers ?? Array.from(
    rows.reduce<Set<string>>((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set())
  );
  const lines = [cols.map(csvCell).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

function tsStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function makeCsvFilename(slug: string): string {
  return `${slug}-${tsStamp()}.csv`;
}

export async function downloadCsv(slug: string, csv: string): Promise<{ ok: boolean; method: string; error?: string }> {
  const filename = makeCsvFilename(slug);

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
      return { ok: true, method: "browser-download" };
    } catch (e: any) {
      return { ok: false, method: "browser-download", error: e?.message || "Download failed" };
    }
  }

  try {
    // @ts-ignore optional native module
    const FS: any = await import("expo-file-system").catch(() => null);
    if (!FS) return { ok: false, method: "none", error: "expo-file-system not available" };
    const dir = FS.documentDirectory || FS.cacheDirectory;
    if (!dir) return { ok: false, method: "none", error: "No writable directory" };
    const uri = dir + filename;
    await FS.writeAsStringAsync(uri, csv, { encoding: FS.EncodingType?.UTF8 ?? "utf8" });
    try {
      const Sharing = await import("expo-sharing");
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export CSV" });
      }
    } catch { /* sharing optional */ }
    return { ok: true, method: "expo-fs" };
  } catch (e: any) {
    return { ok: false, method: "expo-fs", error: e?.message || String(e) };
  }
}
