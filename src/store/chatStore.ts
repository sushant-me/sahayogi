/**
 * Firestore persistence.
 *
 * Every completed inference is written with BOTH the routed prediction and the
 * SDK's actual source. That turns the collection into the evidence behind the
 * README's routing table, and it is what the Transparency panel reads.
 *
 * Writes are made through the offline-enabled Firestore instance, so a message
 * composed with no network is queued durably and syncs on reconnect.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";

import type { InferenceSource, RouteReason, RoutingPolicy, UserMode } from "../ai/policy";
import { getDb, getFirebaseAuth } from "../firebase/config";

export interface StoredMessage {
  id: string;
  role: "user" | "model";
  text: string;
  actualSource: InferenceSource | null;
  predictedMode: string;
  reason: RouteReason | "none";
  latencyMs: number | null;
  deviceModel: string | null;
  syncedOffline: boolean;
  createdAt: number;
}

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  routeMix: { onDevice: number; cloud: number };
  lastReason: RouteReason | "none";
}

function chatsCol(uid: string) {
  return collection(getDb(), "users", uid, "chats");
}

function messagesCol(uid: string, chatId: string) {
  return collection(getDb(), "users", uid, "chats", chatId, "messages");
}

function deviceModelLabel(): string | null {
  const ua = navigator.userAgent;
  return ua.includes("Chrome/") ? ua.match(/Chrome\/[\d.]+/)?.[0] ?? null : null;
}

export async function createChat(uid: string, title: string): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(chatsCol(uid), {
    title: title.slice(0, 120),
    createdAt: now,
    updatedAt: now,
    routeMix: { onDevice: 0, cloud: 0 },
    lastReason: "none",
  });
  return ref.id;
}

export interface AppendMessageInput {
  role: "user" | "model";
  text: string;
  actualSource: InferenceSource | null;
  predictedMode: string;
  reason: RouteReason | "none";
  latencyMs: number | null;
}

export async function appendMessage(
  uid: string,
  chatId: string,
  input: AppendMessageInput,
): Promise<void> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const now = Date.now();

  await addDoc(messagesCol(uid, chatId), {
    role: input.role,
    text: input.text,
    actualSource: input.actualSource,
    predictedMode: input.predictedMode,
    reason: input.reason,
    latencyMs: input.latencyMs,
    deviceModel: deviceModelLabel(),
    syncedOffline: offline,
    createdAt: now,
    createdAtServer: serverTimestamp(),
  });

  const chatUpdate: Record<string, unknown> = {
    updatedAt: now,
    lastReason: input.reason,
  };
  if (input.role === "model" && input.actualSource) {
    chatUpdate.routeMix =
      input.actualSource === "on_device"
        ? { onDevice: increment(1), cloud: increment(0) }
        : { onDevice: increment(0), cloud: increment(1) };
  }

  await updateDoc(doc(getDb(), "users", uid, "chats", chatId), chatUpdate);
}

export function watchChats(
  uid: string,
  onData: (chats: StoredChat[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  const q = query(chatsCol(uid), orderBy("updatedAt", "desc"), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const chats: StoredChat[] = snapshot.docs.map((d) => {
        const data = d.data();
        const mix = (data.routeMix ?? {}) as { onDevice?: number; cloud?: number };
        return {
          id: d.id,
          title: typeof data.title === "string" ? data.title : "Untitled",
          createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
          routeMix: { onDevice: mix.onDevice ?? 0, cloud: mix.cloud ?? 0 },
          lastReason: (typeof data.lastReason === "string" ? data.lastReason : "none") as RouteReason | "none",
        };
      });
      onData(chats);
    },
    (error) => onError(error.message),
  );
}

export function watchMessages(
  uid: string,
  chatId: string,
  onData: (messages: StoredMessage[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  const q = query(messagesCol(uid, chatId), orderBy("createdAt", "asc"), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const messages: StoredMessage[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          role: data.role === "user" ? "user" : "model",
          text: typeof data.text === "string" ? data.text : "",
          actualSource: (data.actualSource ?? null) as InferenceSource | null,
          predictedMode: typeof data.predictedMode === "string" ? data.predictedMode : "unknown",
          reason: (typeof data.reason === "string" ? data.reason : "none") as RouteReason | "none",
          latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : null,
          deviceModel: typeof data.deviceModel === "string" ? data.deviceModel : null,
          syncedOffline: data.syncedOffline === true,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
        };
      });
      onData(messages);
    },
    (error) => onError(error.message),
  );
}

export async function removeChat(uid: string, chatId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "users", uid, "chats", chatId));
}

/** Snapshot of the effective policy, stored so the demo can be audited later. */
export async function saveSettingsSnapshot(
  uid: string,
  payload: { userMode: UserMode; policy: RoutingPolicy; policySource: string },
): Promise<void> {
  await setDoc(
    doc(getDb(), "settings", uid),
    {
      userMode: payload.userMode,
      policy: payload.policy,
      policySource: payload.policySource,
      updatedAt: serverTimestamp(),
      uid: getFirebaseAuth().currentUser?.uid ?? null,
    },
    { merge: true },
  );
}
