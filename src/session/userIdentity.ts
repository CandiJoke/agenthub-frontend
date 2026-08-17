const USER_ID_STORAGE_KEY = "agentHub.userId";

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function randomPart(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2);
}

export function getOrCreateUserId(
  storage: StorageLike = globalThis.localStorage,
): string {
  const existing = storage.getItem(USER_ID_STORAGE_KEY);
  if (existing) return existing;

  const created = `anon_user_${Date.now()}_${randomPart().slice(0, 12)}`;
  storage.setItem(USER_ID_STORAGE_KEY, created);
  return created;
}
