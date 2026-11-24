/**
 * A draft that survives a refresh.
 *
 * Pasted lecture notes and long questions are the expensive input in this app; losing
 * them to a reload is the kind of small betrayal that makes a study tool feel fragile.
 * Drafts are deliberately local-only (never synced) and cleared once used.
 */

import { useCallback, useEffect, useState } from "react";

import { getStorage, readString, removeKey, writeString } from "../lib/storage";

const PREFIX = "sahayogi.draft.";

function available(): boolean {
  return getStorage() !== null;
}

export function readDraft(key: string): string {
  if (!available()) return "";
  try {
    return readString(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(key: string, value: string): void {
  if (!available()) return;
  try {
    if (value) writeString(PREFIX + key, value);
    else removeKey(PREFIX + key);
  } catch {
    /* quota or private mode: a lost draft is not worth breaking the page for */
  }
}

export function clearDraft(key: string): void {
  writeDraft(key, "");
}

/** Reads an initial value once, then keeps the store in step as it changes. */
export function useDraft(key: string, initial = ""): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    const stored = readDraft(key);
    return stored || initial;
  });

  useEffect(() => {
    writeDraft(key, value);
  }, [key, value]);

  const set = useCallback((next: string) => setValue(next), []);
  return [value, set];
}
