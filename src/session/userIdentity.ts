const USER_ID_STORAGE_KEY = "agentHub.userId";
let fallbackUserId: string | undefined;

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

function createUserId(): string {
  return `anon_user_${Date.now()}_${randomPart().slice(0, 12)}`;
}

function getBrowserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function getOrCreateUserId(
  storage: StorageLike | undefined = getBrowserStorage(),
): string {
  try {
    const existing = storage?.getItem(USER_ID_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // Some browser contexts expose localStorage but reject reads.
  }

  if (fallbackUserId) return fallbackUserId;

  const created = createUserId();
  try {
    storage?.setItem(USER_ID_STORAGE_KEY, created);
  } catch {
    // Keep the app usable when persistent storage is blocked.
  }
  fallbackUserId = created;
  return created;
}
