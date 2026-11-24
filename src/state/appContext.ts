/**
 * App context definition and its consumer hook.
 *
 * Kept in a component-free module so the provider file exports only a component
 * (fast refresh), and so any screen can import the hook without pulling the
 * provider implementation into its graph.
 */

import { createContext, useContext } from "react";

import type { DeviceAvailability, RoutingPolicy, UserMode } from "../ai/policy";
import { type configDiagnostics } from "../firebase/config";

export interface Toast {
  id: string;
  kind: "error" | "info" | "success";
  message: string;
  hint?: string;
}

export interface PreflightState {
  running: boolean;
  /** 0..1 while downloading, null when idle. */
  progress: number | null;
  message: string | null;
}

export interface AppContextValue {
  configured: boolean;
  diagnostics: typeof configDiagnostics;
  uid: string | null;
  authError: string | null;
  online: boolean;
  deviceAvailability: DeviceAvailability;
  deviceChecking: boolean;
  preflight: PreflightState;
  policy: RoutingPolicy;
  policySource: string;
  policyIssues: string[];
  userMode: UserMode;
  setUserMode: (mode: UserMode) => void;
  refreshDevice: () => Promise<void>;
  startPreflight: () => Promise<void>;
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
