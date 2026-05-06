const KEY = "alsalik.adminApiKey";

export function getAdminKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAdminKey(key: string): void {
  localStorage.setItem(KEY, key);
}

export function clearAdminKey(): void {
  localStorage.removeItem(KEY);
}

export function hasAdminKey(): boolean {
  return !!getAdminKey();
}
