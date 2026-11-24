/**
 * Firebase bootstrap.
 *
 * Two modes of operation, both honest:
 *  - configured   → full stack (App Check, anonymous auth, Firestore, Remote Config)
 *  - unconfigured → the app renders a setup screen explaining exactly what is
 *    missing. It never fabricates AI output and never pretends to be online.
 *
 * Nothing here is initialised at import time except the SDK's own lazy state, so
 * an unconfigured build cannot crash on boot.
 */

import { initializeApp, type FirebaseApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  type RemoteConfig,
} from "firebase/remote-config";

import { DEFAULT_POLICY } from "../ai/policy";

const env = import.meta.env;

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

function readConfig(): FirebaseWebConfig | null {
  const config: FirebaseWebConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: env.VITE_FIREBASE_APP_ID ?? "",
  };

  const required: Array<keyof FirebaseWebConfig> = ["apiKey", "authDomain", "projectId", "appId"];
  const missing = required.filter((k) => !config[k]);
  if (missing.length > 0) return null;
  return config;
}

export const firebaseWebConfig = readConfig();
export const isFirebaseConfigured = firebaseWebConfig !== null;

/**
 * Firestore database id.
 *
 * This project's database is named `default`, not the auto-created `(default)`.
 * Without the explicit id the SDK talks to `(default)`, every write silently lands
 * in the local cache only, and the console warns "Database '(default)' not found".
 */
export const FIRESTORE_DATABASE_ID = (env.VITE_FIRESTORE_DATABASE_ID as string | undefined) || "default";

export const appCheckConfig = {
  siteKey: env.VITE_APP_CHECK_SITE_KEY ?? "",
  /** "enterprise" (default) or "v3" — see README for the billing escape hatch. */
  provider: (env.VITE_APP_CHECK_PROVIDER ?? "enterprise") as "enterprise" | "v3",
  debug: (env.VITE_APP_CHECK_DEBUG ?? "false") === "true",
  debugToken: env.VITE_APP_CHECK_DEBUG_TOKEN ?? "",
};

export const configDiagnostics = {
  configured: isFirebaseConfigured,
  missing: !isFirebaseConfigured
    ? (["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"] as string[])
    : [],
  appCheck: appCheckConfig.siteKey
    ? `${appCheckConfig.provider} provider`
    : appCheckConfig.debug
      ? "debug token"
      : "disabled (dev)",
  projectId: firebaseWebConfig?.projectId ?? null,
};

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;
let cachedAppCheck: AppCheck | null = null;
let cachedRemoteConfig: RemoteConfig | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseWebConfig) {
    throw new Error("Firebase is not configured. Missing VITE_FIREBASE_* variables.");
  }
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
  return cachedApp;
}

/**
 * Firestore with persistent local cache so history and queued writes survive a
 * reload while offline. This is what makes the offline story real rather than
 * cosmetic: writes made with no network are durably queued and sync later.
 */
export function getDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = initializeFirestore(
    getFirebaseApp(),
    { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
    FIRESTORE_DATABASE_ID,
  );
  return cachedDb;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}

/**
 * App Check. AI Logic requires attestation, so this is not optional in
 * production. In local dev a debug token keeps the loop fast; the README records
 * exactly which mode was used for the recorded demo.
 */
export function initAppCheck(): AppCheck | null {
  if (cachedAppCheck) return cachedAppCheck;
  if (!appCheckConfig.siteKey && !appCheckConfig.debug) return null;

  if (appCheckConfig.debug) {
    const w = self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean };
    w.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckConfig.debugToken || true;
  }

  const provider =
    appCheckConfig.provider === "v3"
      ? new ReCaptchaV3Provider(appCheckConfig.siteKey)
      : new ReCaptchaEnterpriseProvider(appCheckConfig.siteKey);

  cachedAppCheck = initializeAppCheck(getFirebaseApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  return cachedAppCheck;
}

export function getRemoteConfigInstance(): RemoteConfig {
  if (cachedRemoteConfig) return cachedRemoteConfig;
  const rc = getRemoteConfig(getFirebaseApp());
  // Defaults must be usable without a network round-trip: Remote Config is a
  // policy override, never a hard dependency for first paint.
  rc.defaultConfig = {
    routing_policy: JSON.stringify(DEFAULT_POLICY),
  };
  // Deliberately 0: this app's whole point is that an operator can change routing
  // policy and see it take effect on the next load. The 60s client cache would make
  // a live policy change look like it did nothing.
  rc.settings.minimumFetchIntervalMillis = 0;
  cachedRemoteConfig = rc;
  return rc;
}

export interface RemotePolicyResult {
  raw: string | null;
  source: "remote" | "default" | "error";
  error?: string;
}

/** Fetches routing_policy with a hard timeout so boot is never blocked. */
export async function fetchRoutingPolicyRaw(timeoutMs = 8000): Promise<RemotePolicyResult> {
  if (!isFirebaseConfigured) {
    return { raw: JSON.stringify(DEFAULT_POLICY), source: "default" };
  }
  try {
    const rc = getRemoteConfigInstance();
    const activated = await Promise.race([
      fetchAndActivate(rc),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    const raw = getString(rc, "routing_policy");
    return {
      raw: raw || null,
      source: activated ? "remote" : "default",
      error: activated ? undefined : "Remote Config did not respond in time; using cached/default values.",
    };
  } catch (error) {
    // Offline or blocked fetch is not an error the user can act on: fall back to
    // defaults and keep the detail for Settings rather than shouting "error" in the
    // header.
    return {
      raw: null,
      source: "default",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface AuthState {
  user: User | null;
  uid: string | null;
  error: string | null;
}

/**
 * Anonymous identity. Cheap, requires no UI, and gives Firestore rules something
 * real to enforce against (request.auth.uid === path uid).
 */
export async function ensureAnonymousUser(): Promise<AuthState> {
  if (!isFirebaseConfigured) return { user: null, uid: null, error: "Firebase is not configured." };
  const auth = getFirebaseAuth();

  if (auth.currentUser) {
    return { user: auth.currentUser, uid: auth.currentUser.uid, error: null };
  }

  try {
    const cred = await signInAnonymously(auth);
    return { user: cred.user, uid: cred.user.uid, error: null };
  } catch (error) {
    return {
      user: null,
      uid: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function watchAuth(cb: (state: AuthState) => void): () => void {
  if (!isFirebaseConfigured) {
    cb({ user: null, uid: null, error: "Firebase is not configured." });
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), (user) =>
    cb({ user, uid: user?.uid ?? null, error: null }),
  );
}
