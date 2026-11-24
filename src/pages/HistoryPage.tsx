/**
 * History — cache-first chat archive.
 *
 * Firestore's persistent local cache means this page renders from disk with no
 * network. The per-chat route mix is stored, so you can see at a glance which
 * conversations stayed on the device and which used the cloud.
 */

import { useEffect, useMemo, useState } from "react";

import { RouteBadge } from "../components/RouteBadge";
import { Button, Chip, EmptyState, Panel, SectionHeading } from "../components/ui";
import type { InferenceMode } from "../ai/policy";
import { useApp } from "../state/appContext";
import {
  removeChat,
  watchChats,
  watchMessages,
  type StoredChat,
  type StoredMessage,
} from "../store/chatStore";

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

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = watchChats(
      uid,
      (next) => {
        setChats(next);
        setSelected((current) => current ?? next[0]?.id ?? null);
      },
      (message) => setError(message),
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!uid || !selected) return;
    const unsubscribe = watchMessages(
      uid,
      selected,
      setMessages,
      (message) => setError(message),
    );
    return unsubscribe;
  }, [uid, selected]);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === selected) ?? null, [chats, selected]);

  async function handleDelete(chatId: string) {
    if (!uid) return;
    try {
      await removeChat(uid, chatId);
      setSelected((current) => (current === chatId ? null : current));
    } catch (deleteError) {
      pushToast({
        kind: "error",
        message: "Could not delete that chat.",
        hint: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    }
  }

  if (!uid) {
    return (
      <EmptyState
        title="History needs an identity"
        body="Anonymous sign-in has not completed, so there is nothing to read yet. Check Settings for the Firebase connection state."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel className="p-4">
        <SectionHeading
          title="Chats"
          hint={online ? "Synced with Firestore." : "Read from the on-device cache; writes are queued."}
          right={<Chip tone={online ? "neutral" : "warn"}>{chats.length}</Chip>}
        />

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
      </Panel>

      <Panel className="p-4">
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
          <EmptyState
            title="Select a chat"
            body="Pick a conversation on the left to read it. Stored messages keep the routing evidence that was captured when they were generated."
          />
        )}
      </Panel>
    </div>
  );
}
