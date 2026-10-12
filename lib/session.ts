export type StoredObjectRequest = {
  id: string;
  name: string;
  description: string;
};

export type StoredSession = {
  displayName: string;
  isPano: boolean;
  usdLabel: string;
  previewUrl?: string;
  extras?: {
    ambientPrompt: string;
    objects: StoredObjectRequest[];
  };
};

const STORAGE_KEY = "image-blaster.sessions";
const images = new Map<string, string>();
const memory = new Map<string, StoredSession>();

export function rememberSourceImage(operationId: string, dataUrl: string) {
  images.set(operationId, dataUrl);
}

export function sourceImageFor(operationId: string): string | undefined {
  return images.get(operationId);
}

export function saveSession(operationId: string, session: StoredSession) {
  memory.set(operationId, session);
  if (typeof window === "undefined") return;
  try {
    const all = readAll();
    const stored: StoredSession = {
      ...session,
      previewUrl: session.previewUrl && session.previewUrl.length < 350_000 ? session.previewUrl : undefined,
    };
    all[operationId] = stored;
    const entries = Object.entries(all).slice(-6);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // A full storage quota should not block generation.
  }
}

export function loadSession(operationId: string): StoredSession | null {
  return memory.get(operationId) ?? readAll()[operationId] ?? null;
}

function readAll(): Record<string, StoredSession> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, StoredSession>;
  } catch {
    return {};
  }
}
