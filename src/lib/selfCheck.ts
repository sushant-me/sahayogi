/**
 * In-app readiness check.
 *
 * The same things `scripts/preflight.mjs` proves from a terminal, but run in the browser
 * against the real SDK: config, anonymous auth, App Check attestation, Remote Config,
 * a Firestore write→read→delete round-trip, the on-device model and the network. A judge
 * can click one button instead of trusting the README.
 *
 * Deliberately does NOT call the model: that would spend quota to prove a point, and the
 * inference path already reports its own state per answer.
 */

import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

import { getToken } from "firebase/app-check";

import type { DeviceAvailability } from "../ai/policy";
import {
  configDiagnostics,
  ensureAnonymousUser,
  fetchRoutingPolicyRaw,
  getDb,
  initAppCheck,
  isFirebaseConfigured,
} from "../firebase/config";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function runSelfCheck(options: {
  online: boolean;
  deviceAvailability: DeviceAvailability;
  policySource: string;
}): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(
    isFirebaseConfigured
      ? {
          id: "config",
          label: "Firebase config",
          status: "pass",
          detail: `project ${configDiagnostics.projectId ?? "unknown"}`,
        }
      : {
          id: "config",
          label: "Firebase config",
          status: "fail",
          detail: `missing ${configDiagnostics.missing.join(", ") || "values"} — see .env.example`,
        },
  );

  results.push({
    id: "network",
    label: "Network",
    status: options.online ? "pass" : "warn",
    detail: options.online ? "online" : "offline — cloud answers will fail, cached history still opens",
  });

  if (!isFirebaseConfigured) {
    results.push({
      id: "auth",
      label: "Anonymous auth",
      status: "fail",
      detail: "skipped: no Firebase config",
    });
    results.push({ id: "appcheck", label: "App Check", status: "fail", detail: "skipped: no Firebase config" });
    results.push({ id: "firestore", label: "Firestore", status: "fail", detail: "skipped: no Firebase config" });
    results.push({ id: "policy", label: "Remote policy", status: "fail", detail: "skipped: no Firebase config" });
    results.push(deviceResult(options.deviceAvailability));
    return results;
  }

  let uid: string | null = null;
  try {
    const auth = await ensureAnonymousUser();
    uid = auth.uid;
    results.push({
      id: "auth",
      label: "Anonymous auth",
      status: auth.uid ? "pass" : "fail",
      detail: auth.uid ? `uid ${auth.uid.slice(0, 8)}…` : (auth.error ?? "no identity issued"),
    });
  } catch (error) {
    results.push({ id: "auth", label: "Anonymous auth", status: "fail", detail: truncate(message(error)) });
  }

  try {
    const appCheck = initAppCheck();
    if (!appCheck) {
      results.push({
        id: "appcheck",
        label: "App Check",
        status: "fail",
        detail: "not initialised — AI Logic requires attestation",
      });
    } else {
      await getToken(appCheck, false);
      results.push({ id: "appcheck", label: "App Check", status: "pass", detail: "attestation token acquired" });
    }
  } catch (error) {
    results.push({
      id: "appcheck",
      label: "App Check",
      status: "fail",
      detail: truncate(message(error)),
    });
  }

  if (uid) {
    const path = `users/${uid}/selfChecks/${Date.now().toString(36)}`;
    try {
      const ref = doc(getDb(), path);
      await setDoc(ref, { at: Date.now(), by: "self-check" });
      const read = await getDoc(ref);
      const wrote = read.exists();
      await deleteDoc(ref);
      results.push({
        id: "firestore",
        label: "Firestore",
        status: wrote ? "pass" : "fail",
        detail: wrote ? "write → read → delete round-trip ok" : "wrote but read back nothing",
      });
    } catch (error) {
      results.push({
        id: "firestore",
        label: "Firestore",
        status: "fail",
        detail: truncate(message(error)),
      });
    }
  } else {
    results.push({
      id: "firestore",
      label: "Firestore",
      status: "warn",
      detail: "no identity, so history is local-only by design",
    });
  }

  try {
    const policy = await fetchRoutingPolicyRaw(6000);
    const source = policy.raw ? "remote" : "default";
    results.push({
      id: "policy",
      label: "Remote policy",
      status: source === "remote" ? "pass" : "warn",
      detail:
        source === "remote"
          ? "routing_policy fetched from Remote Config"
          : `falling back to built-in defaults${policy.error ? ` (${truncate(policy.error, 70)})` : ""}`,
    });
  } catch (error) {
    results.push({
      id: "policy",
      label: "Remote policy",
      status: "warn",
      detail: truncate(message(error)),
    });
  }

  results.push(deviceResult(options.deviceAvailability));
  return results;
}

function deviceResult(availability: DeviceAvailability): CheckResult {
  if (availability === "available") {
    return { id: "device", label: "On-device model", status: "pass", detail: "Gemini Nano is ready" };
  }
  if (availability === "unsupported") {
    return {
      id: "device",
      label: "On-device model",
      status: "warn",
      detail: "this browser has no Prompt API — answers will be cloud-only",
    };
  }
  return {
    id: "device",
    label: "On-device model",
    status: "warn",
    detail: "weights not installed — use 'Enable offline mode' on the Ask page to download them",
  };
}
