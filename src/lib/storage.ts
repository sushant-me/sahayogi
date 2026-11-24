/**
 * Safe access to `localStorage`.
 *
 * Every earlier guard in this project looked like `typeof window.localStorage !== "undefined"`,
 * which is not enough: when a browser refuses storage it can do so with a *throwing getter*, so
 * even reading the property throws. In that state the whole app failed to render — a
 * SecurityError at startup — which is a far worse outcome than losing a draft.
 *
 * This is the only module that touches the global. Everything else asks it and gets `null`.
 */

export function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    if (!storage) return null;
    // A getter can succeed once and still refuse writes; prove it works with a cheap round-trip.
    const probe = "__sahayogi_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    /* quota or refused write: a lost draft is not worth breaking the page */
  }
}

export function removeKey(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readJSON<T>(key: string): T | null {
  const raw = readString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    /* unserialisable value: skip rather than throw */
  }
}
