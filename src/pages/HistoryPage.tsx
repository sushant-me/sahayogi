/**
 * History — cache-first chat archive.
 *
 * Firestore's persistent local cache means this page renders from disk with no
 * network. The per-chat route mix is stored, so you can see at a glance which
 * conversations stayed on the device and which used the cloud.
 */

import { useEffect, useMemo, useState } from "react";

import { RouteBadge } from "../components/RouteBadge";
import { BentoCard, BentoGrid } from "../components/bento";
import { Button, Chip } from "../components/ui";
import type { InferenceMode } from "../ai/policy";
import { useApp } from "../state/appContext";
import type { StoredChat, StoredMessage } from "../store/chatStore";
import { getPersistence, type PersistenceMode } from "../store/persistence";

function formatWhen(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryPage() {
  const { uid, online, pushToast } = useApp();
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const store = useMemo(() => getPersistence(uid), [uid]);
  const mode: PersistenceMode = store.mode;

  useEffect(() => {
    const unsubscribe = store.watchChats(
      (next) => {
        setChats(next);
        setSelected((current) => current ?? next[0]?.id ?? null);
      },
      (message) => setError(message),
    );
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!selected) return;
    const unsubscribe = store.watchMessages(
      selected,
      (next) => setMessages(next),
      (message) => setError(message),
    );
    return unsubscribe;
  }, [store, selected]);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === selected) ?? null, [chats, selected]);

  async function handleDelete(chatId: string) {
    try {
      await store.removeChat(chatId);
      setSelected((current) => (current === chatId ? null : current));
    } catch (deleteError) {
      pushToast({
        kind: "error",
        message: "Could not delete that chat.",
        hint: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    }
  }

  return (
    <BentoGrid>
      <BentoCard
        span="lg:col-span-4 sm:col-span-6"
        label="Chats"
        meta={
          <div className="flex items-center gap-1.5">
            <Chip tone={mode === "local" ? "warn" : "device"}>{mode === "local" ? "local only" : "synced"}</Chip>
            <Chip tone="neutral">{chats.length}</Chip>
          </div>
        }
        accent={mode === "local" ? "warn" : "device"}
      >
        <p className="mb-2 text-[11px] leading-relaxed text-muted">
          {mode === "local"
            ? "Stored in this browser only — sign-in is unavailable, so history is not synced."
            : online
              ? "Synced with Firestore."
              : "Read from the on-device cache; writes are queued."}
        </p>

        {chats.length === 0 ? (
          <p className="px-1 text-[12.5px] leading-relaxed text-muted">
            No chats yet. Answers on the Ask page are saved here automatically, including ones written while offline.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {chats.map((chat) => {
              const active = chat.id === selected;
              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setSelected(chat.id);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      active ? "border-accent/40 bg-accent/[0.07]" : "border-line bg-panel-2/40 hover:border-line/80"
                    }`}
                  >
                    <p className="truncate text-[12.5px] font-medium text-ink">{chat.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span>{formatWhen(chat.updatedAt)}</span>
                      {chat.routeMix.onDevice > 0 ? <span className="text-device">⚡ {chat.routeMix.onDevice}</span> : null}
                      {chat.routeMix.cloud > 0 ? <span className="text-cloud">☁️ {chat.routeMix.cloud}</span> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </BentoCard>

      <BentoCard span="lg:col-span-8 sm:col-span-6" label="Conversation" flush>
        <div className="px-4 pb-4">
        {error ? (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        ) : null}

        {activeChat ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold text-ink">{activeChat.title}</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {messages.length} messages · {formatWhen(activeChat.updatedAt)}
                </p>
              </div>
              <Button variant="ghost" onClick={() => void handleDelete(activeChat.id)}>
                Delete
              </Button>
            </div>

            {messages.length === 0 ? (
              <p className="text-[12.5px] text-muted">No messages stored in this chat yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      message.role === "user" ? "border-line bg-panel-2/50" : "border-line bg-panel-2/20"
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-muted">{message.role}</span>
                      {message.role === "model" ? (
                        <RouteBadge
                          predictedMode={message.predictedMode as InferenceMode}
                          actual={message.actualSource}
                          latencyMs={message.latencyMs}
                        />
                      ) : null}
                      {message.syncedOffline ? <Chip tone="warn">queued offline</Chip> : null}
                      {message.reason !== "none" ? (
                        <span className="text-[11px] text-muted">{message.reason}</span>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{message.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-line/70 px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-ink">Select a chat</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted">
              Stored messages keep the routing evidence captured when they were generated.
            </p>
          </div>
        )}
        </div>
      </BentoCard>
    </BentoGrid>
  );
}
