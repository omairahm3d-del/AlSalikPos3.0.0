import { Platform, Alert } from "react-native";

export function confirmDestructive(title: string, message: string, confirmText = "OK"): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      const ok = typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(`${title}\n\n${message}`)
        : true;
      return Promise.resolve(!!ok);
    } catch {
      return Promise.resolve(true);
    }
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(message ? `${title}\n\n${message}` : title);
        return;
      }
    } catch {}
  }
  Alert.alert(title, message);
}
