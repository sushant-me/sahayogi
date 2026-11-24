/**
 * Application state.
 *
 * One provider owns the things every screen needs: Firebase connection state,
 * connectivity, device capability, the routing policy, and the user's mode.
 * Components stay dumb and the router stays pure.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getDeviceAvailability, preflightDeviceModel } from "../ai/models";
import type { DeviceAvailability, RoutingPolicy, UserMode } from "../ai/policy";
import { DEFAULT_POLICY, parsePolicy } from "../ai/policy";
import { SYSTEM_INSTRUCTION } from "../ai/prompts";
import { getAiLogic } from "../firebase/ai";
import {
  configDiagnostics,
  ensureAnonymousUser,
  fetchRoutingPolicyRaw,
  warmAppCheckToken,
  isFirebaseConfigured,
} from "../firebase/config";
import {
  AppContext,
  type AppContextValue,
  type PreflightState,
  type Toast,
} from "./appContext";


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
  const [deviceChecking, setDeviceChecking] = useState(isFirebaseConfigured);
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
    if (!isFirebaseConfigured) return;
    let cancelled = false;

    void (async () => {
      // Attestation first: it is required by AI Logic and its token exchange is
      // the slowest part of the first request.
      try {
        // Warm the attestation token so the first question is not paying for the
        // exchange; a failure here is harmless because the request path retries it.
        warmAppCheckToken();
      } catch (error) {
        console.warn("[sahayogi] App Check init failed:", error);
      }

      // Constructing the AI client is cheap but not free; do it during boot so the
      // first question does not pay for it.
      try {
        getAiLogic();
      } catch (error) {
        console.warn("[sahayogi] AI client warm-up failed:", error);
      }
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
    let cancelled = false;
    void (async () => {
      const availability = await getDeviceAvailability();
      if (cancelled) return;
      setDeviceAvailability(availability);
      setDeviceChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
