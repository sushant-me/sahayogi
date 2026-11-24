/**
 * Local-only history.
 *
 * Firestore needs an authenticated uid. When sign-in is unavailable — the provider
 * is disabled, Identity Platform has not been enabled, or the device is offline
 * before the first sign-in — the app still has to be a usable study tool.
 *
 * So history falls back to this store, and the UI says so plainly: "local only,
 * not synced". Nothing is pretending to be in the cloud.
 */

import { getStorage, readString, writeJSON } from "../lib/storage";
import type { AppendMessageInput, StoredChat, StoredMessage } from "./chatStore";

const CHATS_KEY = "sahayogi.local.chats";
const MESSAGES_KEY = "sahayogi.local.messages";

// Storage may be absent *or* refuse access with a throwing getter; getStorage handles both.
const hasStorage = () => getStorage() !== null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function read<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = readString(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    writeJSON(key, value);
  } catch {
    // Quota exceeded or storage blocked: history silently stops growing rather
    // than breaking the screen the user is on.
  }
}

function nextId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function localCreateChat(title: string): string {
  const now = Date.now();
  const chat: StoredChat = {
    id: nextId("c"),
    title: title.slice(0, 120),
    createdAt: now,
    updatedAt: now,
    routeMix: { onDevice: 0, cloud: 0 },
    lastReason: "none",
  };
  write(CHATS_KEY, [chat, ...read<StoredChat[]>(CHATS_KEY, [])].slice(0, 50));
  emit();
  return chat.id;
}

export function localAppendMessage(chatId: string, input: AppendMessageInput): void {
  const message: StoredMessage = {
    id: nextId("m"),
    role: input.role,
    text: input.text,
    actualSource: input.actualSource,
    predictedMode: input.predictedMode,
    reason: input.reason,
    latencyMs: input.latencyMs,
    deviceModel: null,
    // Local-only history is never queued for sync, so this stays false and the
    // UI's "written offline, queued" chip is reserved for the Firestore path.
    syncedOffline: false,
    createdAt: Date.now(),
  };

  const all = read<Record<string, StoredMessage[]>>(MESSAGES_KEY, {});
  all[chatId] = [...(all[chatId] ?? []), message];
  write(MESSAGES_KEY, all);

  const chats = read<StoredChat[]>(CHATS_KEY, []).map((chat) => {
    if (chat.id !== chatId) return chat;
    const routeMix = { ...chat.routeMix };
    if (input.role === "model" && input.actualSource) {
      if (input.actualSource === "on_device") routeMix.onDevice += 1;
      else routeMix.cloud += 1;
    }
    return { ...chat, updatedAt: Date.now(), lastReason: input.reason, routeMix };
  });
  write(CHATS_KEY, chats);
  emit();
}

export function localReadChats(): StoredChat[] {
  return read<StoredChat[]>(CHATS_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function localReadMessages(chatId: string): StoredMessage[] {
  const all = read<Record<string, StoredMessage[]>>(MESSAGES_KEY, {});
  return [...(all[chatId] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
}

export function localRemoveChat(chatId: string): void {
  write(CHATS_KEY, read<StoredChat[]>(CHATS_KEY, []).filter((c) => c.id !== chatId));
  const all = read<Record<string, StoredMessage[]>>(MESSAGES_KEY, {});
  delete all[chatId];
  write(MESSAGES_KEY, all);
  emit();
}

/** Subscribes to local changes; returns an unsubscribe function. */
export function subscribeLocal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Exposed for tests and for a future "clear local data" control. */
export function clearLocalHistory(): void {
  write(CHATS_KEY, []);
  write(MESSAGES_KEY, {});
  emit();
}
