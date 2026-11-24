// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPersistence } from "../src/store/persistence";
import {
  clearLocalHistory,
  localAppendMessage,
  localCreateChat,
  localReadChats,
  localReadMessages,
  localRemoveChat,
  subscribeLocal,
} from "../src/store/localStore";

const message = (over: Partial<Parameters<typeof localAppendMessage>[1]> = {}) => ({
  role: "model" as const,
  text: "answer",
  actualSource: "on_device" as const,
  predictedMode: "prefer_on_device",
  reason: "light-task" as const,
  latencyMs: 50,
  ...over,
});

beforeEach(() => {
  clearLocalHistory();
});

describe("localStore", () => {
  it("creates a chat and lists it", () => {
    const id = localCreateChat("Ohm's law");
    const chats = localReadChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].id).toBe(id);
    expect(chats[0].title).toBe("Ohm's law");
    expect(chats[0].routeMix).toEqual({ onDevice: 0, cloud: 0 });
  });

  it("appends messages in order and counts the route mix", () => {
    const id = localCreateChat("chat");
    localAppendMessage(id, message({ role: "user", actualSource: null }));
    localAppendMessage(id, message({ actualSource: "on_device" }));
    localAppendMessage(id, message({ actualSource: "in_cloud", reason: "heavy-task" }));

    const messages = localReadMessages(id);
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[2].actualSource).toBe("in_cloud");

    const chat = localReadChats()[0];
    expect(chat.routeMix).toEqual({ onDevice: 1, cloud: 1 });
    expect(chat.lastReason).toBe("heavy-task");
  });

  it("never marks local messages as queued for sync", () => {
    const id = localCreateChat("chat");
    localAppendMessage(id, message());
    expect(localReadMessages(id)[0].syncedOffline).toBe(false);
  });

  it("sorts chats by most recently updated", () => {
    // Control the clock: two chats created in the same millisecond would tie.
    let now = 1_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => (now += 1_000));
    try {
      const first = localCreateChat("first");
      const second = localCreateChat("second");
      localAppendMessage(first, message()); // touches "first" last
      const chats = localReadChats();
      expect(chats[0].id).toBe(first);
      expect(chats[1].id).toBe(second);
    } finally {
      spy.mockRestore();
    }
  });

  it("removes a chat and its messages", () => {
    const id = localCreateChat("chat");
    localAppendMessage(id, message());
    localRemoveChat(id);
    expect(localReadChats()).toHaveLength(0);
    expect(localReadMessages(id)).toHaveLength(0);
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocal(listener);
    localCreateChat("chat");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    localCreateChat("another");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives corrupt storage instead of throwing", () => {
    window.localStorage.setItem("sahayogi.local.chats", "{not json");
    expect(localReadChats()).toEqual([]);
  });
});

describe("persistence facade", () => {
  it("uses local mode when there is no uid", () => {
    expect(getPersistence(null).mode).toBe("local");
  });

  it("uses cloud mode when a uid exists", () => {
    expect(getPersistence("uid-123").mode).toBe("cloud");
  });

  it("emits an initial snapshot and then updates in local mode", async () => {
    const store = getPersistence(null);
    const seen: number[] = [];
    const unsubscribe = store.watchChats((chats) => seen.push(chats.length));
    expect(seen).toEqual([0]);

    await store.createChat("from the facade");
    expect(seen[seen.length - 1]).toBe(1);
    unsubscribe();
  });

  it("round-trips a message through the facade in local mode", async () => {
    const store = getPersistence(null);
    const chatId = await store.createChat("chat");
    const seen: string[][] = [];
    const unsubscribe = store.watchMessages(chatId, (messages) => seen.push(messages.map((m) => m.text)));

    await store.appendMessage(chatId, {
      role: "model",
      text: "the answer",
      actualSource: "on_device",
      predictedMode: "prefer_on_device",
      reason: "light-task",
      latencyMs: 12,
    });

    expect(seen[seen.length - 1]).toEqual(["the answer"]);
    unsubscribe();
  });

  it("deletes through the facade", async () => {
    const store = getPersistence(null);
    const chatId = await store.createChat("chat");
    await store.removeChat(chatId);
    expect(localReadChats()).toHaveLength(0);
  });
});
