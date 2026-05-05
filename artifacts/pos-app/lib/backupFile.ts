import { Platform } from "react-native";
import type { BackupData } from "@/types";

export function makeBackupFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `alsalik-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export async function downloadBackup(data: BackupData): Promise<{ ok: boolean; method: string; error?: string }> {
  const json = JSON.stringify(data, null, 2);
  const filename = makeBackupFilename();

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([json], { type: "application/json" });
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
    await FS.writeAsStringAsync(uri, json, { encoding: FS.EncodingType?.UTF8 ?? "utf8" });
    try {
      const Sharing = await import("expo-sharing");
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Save POS Backup" });
      }
    } catch { /* sharing optional */ }
    return { ok: true, method: "expo-fs", error: undefined };
  } catch (e: any) {
    return { ok: false, method: "expo-fs", error: e?.message || String(e) };
  }
}

export async function pickBackup(): Promise<{ ok: boolean; data?: BackupData; error?: string }> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve({ ok: false, error: "No file selected" }); return; }
        try {
          const text = await file.text();
          const data = JSON.parse(text) as BackupData;
          if (data.app !== "al-salik-pos" || !data.tables) {
            resolve({ ok: false, error: "Invalid backup file" });
            return;
          }
          resolve({ ok: true, data });
        } catch (e: any) {
          resolve({ ok: false, error: e?.message || "Could not parse file" });
        }
      };
      input.click();
    });
  }
  try {
    // @ts-ignore optional native module
    const Picker: any = await import("expo-document-picker").catch(() => null);
    if (!Picker) return { ok: false, error: "Document picker not available on this device" };
    const res = await Picker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return { ok: false, error: "Cancelled" };
    // @ts-ignore optional native module
    const FS: any = await import("expo-file-system");
    const text = await FS.readAsStringAsync(res.assets[0].uri);
    const data = JSON.parse(text) as BackupData;
    if (data.app !== "al-salik-pos" || !data.tables) return { ok: false, error: "Invalid backup file" };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
