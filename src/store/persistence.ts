/**
 * Persistence facade.
 *
 * Two honest modes:
 *   cloud — Firestore, owner-only rules, offline write queue (needs a uid)
 *   local — this browser only, labelled as such (no uid: auth disabled or failed)
 *
 * The screens do not care which one is active; they render the mode's label.
 */

import {
  localAppendMessage,
  localCreateChat,
  localReadChats,
  localReadMessages,
  localRemoveChat,
  subscribeLocal,
} from "./localStore";
import {
  appendMessage,
  createChat,
  removeChat,
  watchChats,
  watchMessages,
  type AppendMessageInput,
  type StoredChat,
  type StoredMessage,
} from "./chatStore";

export type PersistenceMode = "cloud" | "local";

export interface ChatPersistence {
  mode: PersistenceMode;
  createChat(title: string): Promise<string>;
  appendMessage(chatId: string, input: AppendMessageInput): Promise<void>;
  watchChats(onData: (chats: StoredChat[]) => void, onError: (message: string) => void): () => void;
  watchMessages(
    chatId: string,
    onData: (messages: StoredMessage[]) => void,
    onError: (message: string) => void,
  ): () => void;
  removeChat(chatId: string): Promise<void>;
}

export function getPersistence(uid: string | null): ChatPersistence {
  if (uid) {
    return {
      mode: "cloud",
      createChat: (title) => createChat(uid, title),
      appendMessage: (chatId, input) => appendMessage(uid, chatId, input),
      watchChats: (onData, onError) => watchChats(uid, onData, onError),
      watchMessages: (chatId, onData, onError) => watchMessages(uid, chatId, onData, onError),
      removeChat: (chatId) => removeChat(uid, chatId),
    };
  }

  return {
    mode: "local",
    createChat: async (title) => localCreateChat(title),
    appendMessage: async (chatId, input) => {
      localAppendMessage(chatId, input);
    },
    watchChats: (onData) => {
      const push = () => onData(localReadChats());
      push();
      return subscribeLocal(push);
    },
    watchMessages: (chatId, onData) => {
      const push = () => onData(localReadMessages(chatId));
      push();
      return subscribeLocal(push);
    },
    removeChat: async (chatId) => {
      localRemoveChat(chatId);
    },
  };
}
