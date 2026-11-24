/**
 * Application state.
 *
 * One provider owns the things every screen needs: Firebase connection state,
 * connectivity, device capability, the routing policy, and the user's mode.
 * Components stay dumb and the router stays pure.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getDeviceAvailability, preflightDeviceModel } from "../ai/models";
import type { DeviceAvailability, RoutingPolicy, UserMode } from "../ai/policy";
import { DEFAULT_POLICY, parsePolicy } from "../ai/policy";
import { SYSTEM_INSTRUCTION } from "../ai/prompts";
import {
  configDiagnostics,
  ensureAnonymousUser,
  fetchRoutingPolicyRaw,
  isFirebaseConfigured,
} from "../firebase/config";

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

interface AppContextValue {
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

const AppContext = createContext<AppContextValue | null>(null);

const USER_MODE_KEY = "sahayogi.userMode";

function readStoredMode(): UserMode {
  try {
    const raw = localStorage.getItem(USER_MODE_KEY);
    if (raw === "auto" || raw === "on-device" || raw === "cloud") return raw;
  } catch {
    // localStorage can be unavailable in private mode; default is fine.
  }
  return "auto";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(() => navigator.onLine !== false);
  const [deviceAvailability, setDeviceAvailability] = useState<DeviceAvailability>("unsupported");
  const [deviceChecking, setDeviceChecking] = useState(true);
  const [preflight, setPreflight] = useState<PreflightState>({
    running: false,
    progress: null,
    message: null,
  });
  const [policy, setPolicy] = useState<RoutingPolicy>(DEFAULT_POLICY);
  const [policySource, setPolicySource] = useState<string>("default");
  const [policyIssues, setPolicyIssues] = useState<string[]>([]);
  const [userMode, setUserModeState] = useState<UserMode>(readStoredMode);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    toastSeq.current += 1;
    const id = `t${toastSeq.current}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const setUserMode = useCallback((mode: UserMode) => {
    setUserModeState(mode);
    try {
      localStorage.setItem(USER_MODE_KEY, mode);
    } catch {
      // Non-fatal: the in-memory value still applies for this session.
    }
  }, []);

  const refreshDevice = useCallback(async () => {
    setDeviceChecking(true);
    const availability = await getDeviceAvailability();
    setDeviceAvailability(availability);
    setDeviceChecking(false);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setDeviceChecking(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      const auth = await ensureAnonymousUser();
      if (!cancelled) {
        setUid(auth.uid);
        setAuthError(auth.error);
        if (auth.error) {
          pushToast({ kind: "error", message: "Anonymous sign-in failed.", hint: auth.error });
        }
      }

      const remote = await fetchRoutingPolicyRaw();
      const parsed = parsePolicy(remote.raw ?? JSON.stringify(DEFAULT_POLICY));
      if (!cancelled) {
        setPolicy(parsed.policy);
        setPolicySource(remote.source);
        setPolicyIssues(remote.error ? [...parsed.issues, remote.error] : parsed.issues);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => {
    void refreshDevice();
  }, [refreshDevice]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const startPreflight = useCallback(async () => {
    if (preflight.running) return;
    setPreflight({ running: true, progress: null, message: "Starting on-device model…" });
    try {
      const result = await preflightDeviceModel(policy.cloudModel, SYSTEM_INSTRUCTION, (loaded) => {
        setPreflight((current) => ({ ...current, progress: loaded }));
      });
      setPreflight({ running: false, progress: 1, message: result.message });
      pushToast({
        kind: result.ok ? "success" : "error",
        message: result.ok ? "On-device model ready. Inference will stay on this device." : "On-device model unavailable.",
        hint: result.ok ? undefined : result.message,
      });
      await refreshDevice();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPreflight({ running: false, progress: null, message });
      pushToast({
        kind: "error",
        message: "Could not prepare the on-device model.",
        hint: message,
      });
      await refreshDevice();
    }
  }, [preflight.running, policy.cloudModel, pushToast, refreshDevice]);

  const value = useMemo<AppContextValue>(
    () => ({
      configured: isFirebaseConfigured,
      diagnostics: configDiagnostics,
      uid,
      authError,
      online,
      deviceAvailability,
      deviceChecking,
      preflight,
      policy,
      policySource,
      policyIssues,
      userMode,
      setUserMode,
      refreshDevice,
      startPreflight,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      uid,
      authError,
      online,
      deviceAvailability,
      deviceChecking,
      preflight,
      policy,
      policySource,
      policyIssues,
      userMode,
      setUserMode,
      refreshDevice,
      startPreflight,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
