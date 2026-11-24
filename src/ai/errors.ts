/**
 * Typed failure taxonomy.
 *
 * Every failure path in the product maps to exactly one code, and every code has
 * a UI affordance. There is no bare `catch (e) {}` in this codebase: a silent
 * catch is how a submission loses points it cannot win back.
 */

import type { RouteReason } from "./policy";

export type AppErrorCode =
  | "NOT_CONFIGURED"
  | "APP_CHECK_FAILED"
  | "AUTH_FAILED"
  | "DEVICE_UNAVAILABLE"
  | "DEVICE_NOT_READY"
  | "LANGUAGE_UNSUPPORTED_ON_DEVICE"
  | "OFFLINE_NO_DEVICE"
  | "QUOTA_EXCEEDED"
  | "PERMISSION_DENIED"
  | "MODEL_NOT_FOUND"
  | "NETWORK"
  | "CANCELLED"
  | "UNKNOWN";

export interface AppErrorShape {
  code: AppErrorCode;
  message: string;
  /** Actionable next step shown to the user. */
  hint: string;
  /** Whether retrying the same request could plausibly succeed. */
  retryable: boolean;
  cause?: unknown;
  reason?: RouteReason;
}

export class AppError extends Error implements AppErrorShape {
  code: AppErrorCode;
  hint: string;
  retryable: boolean;
  cause?: unknown;
  reason?: RouteReason;

  constructor(shape: Omit<AppErrorShape, "message"> & { message: string }) {
    super(shape.message);
    this.name = "AppError";
    this.code = shape.code;
    this.hint = shape.hint;
    this.retryable = shape.retryable;
    this.cause = shape.cause;
    this.reason = shape.reason;
  }
}

const HINTS: Record<AppErrorCode, string> = {
  NOT_CONFIGURED: "Add your Firebase web config to .env.local, then reload.",
  APP_CHECK_FAILED: "App Check could not attest this request. Check the site key and the registered domains.",
  AUTH_FAILED: "Anonymous sign-in failed. Check that the Anonymous provider is enabled.",
  DEVICE_UNAVAILABLE: "This device cannot run Gemini Nano. Switch Mode to Auto or Cloud.",
  DEVICE_NOT_READY: "The on-device model is still downloading. Wait for it, or switch Mode to Auto.",
  LANGUAGE_UNSUPPORTED_ON_DEVICE: "This language is cloud-only. Switch Mode to Auto to route it automatically.",
  OFFLINE_NO_DEVICE: "You are offline and no on-device model is ready. Reconnect, or turn on offline mode while online.",
  QUOTA_EXCEEDED: "The free AI Logic quota is exhausted for now. Wait a few minutes and retry.",
  PERMISSION_DENIED:
    "AI Logic is not enabled for this project. Build → AI Logic → Get started, accept the terms, then retry.",
  MODEL_NOT_FOUND: "The configured cloud model id was rejected. Check routing_policy.cloudModel.",
  NETWORK: "The network request failed. Check your connection and retry.",
  CANCELLED: "The request was cancelled.",
  UNKNOWN: "Something unexpected happened. Retry, and check the console for details.",
};

const RETRYABLE: Record<AppErrorCode, boolean> = {
  NOT_CONFIGURED: false,
  APP_CHECK_FAILED: false,
  AUTH_FAILED: false,
  DEVICE_UNAVAILABLE: false,
  DEVICE_NOT_READY: true,
  LANGUAGE_UNSUPPORTED_ON_DEVICE: false,
  OFFLINE_NO_DEVICE: true,
  QUOTA_EXCEEDED: true,
  PERMISSION_DENIED: false,
  MODEL_NOT_FOUND: false,
  NETWORK: true,
  CANCELLED: false,
  UNKNOWN: true,
};

export function appError(
  code: AppErrorCode,
  message: string,
  extra: Partial<Omit<AppErrorShape, "code" | "message">> = {},
): AppError {
  return new AppError({
    code,
    message,
    hint: extra.hint ?? HINTS[code],
    retryable: extra.retryable ?? RETRYABLE[code],
    cause: extra.cause,
    reason: extra.reason,
  });
}

/**
 * Maps SDK/Firebase errors onto our taxonomy.
 *
 * We match on both `code` (AIError.code, FunctionsError.code) and message text
 * because the AI Logic SDK surfaces several failure shapes and the stable
 * identifier differs between the local and remote path.
 */
export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const err = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  const rawCode = typeof err?.code === "string" ? err.code : "";
  const rawName = typeof err?.name === "string" ? err.name : "";
  const message = typeof err?.message === "string" ? err.message : String(error ?? "Unknown error");
  // `name` matters: DOMException-based failures (NotSupportedError, AbortError)
  // put the classification there, not in the message.
  const haystack = `${rawName} ${rawCode} ${message}`.toLowerCase();

  const make = (code: AppErrorCode, msg = message, reason?: RouteReason) =>
    appError(code, msg, { cause: error, reason });

  if (haystack.includes("app check") || haystack.includes("appcheck") || haystack.includes("app-check")) {
    return make("APP_CHECK_FAILED");
  }
  if (haystack.includes("only_on_device") || haystack.includes("on-device model is not available") || haystack.includes("local languagemodel api not available")) {
    return make("DEVICE_UNAVAILABLE");
  }
  if (haystack.includes("notsupported") || haystack.includes("not supported") || haystack.includes("unsupported language")) {
    return make("LANGUAGE_UNSUPPORTED_ON_DEVICE");
  }
  // gRPC/HTTP codes arrive with either separator depending on the transport.
  if (
    haystack.includes("quota") ||
    haystack.includes("resource_exhausted") ||
    haystack.includes("resource-exhausted") ||
    haystack.includes("429")
  ) {
    return make("QUOTA_EXCEEDED");
  }
  if (haystack.includes("not found") || haystack.includes("404") || haystack.includes("model_not_found") || haystack.includes("invalid model")) {
    return make("MODEL_NOT_FOUND");
  }
  if (haystack.includes("api_not_enabled") || haystack.includes("api not enabled") || haystack.includes("has not been used in project")) {
    return make("MODEL_NOT_FOUND", "AI Logic is not enabled for this project.", undefined);
  }
  if (
    haystack.includes("permission denied") ||
    haystack.includes("access_denied") ||
    haystack.includes("permission_denied") ||
    haystack.includes("403")
  ) {
    return make("PERMISSION_DENIED");
  }
  if (haystack.includes("fetch") || haystack.includes("network") || haystack.includes("offline") || haystack.includes("failed to fetch")) {
    return make("NETWORK");
  }
  if (haystack.includes("cancel") || haystack.includes("abort")) {
    return make("CANCELLED");
  }

  return make("UNKNOWN");
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Raised before any SDK call when we already know the request cannot work.
 *
 * The message distinguishes the two very different situations that both end in
 * "cannot run offline". Telling someone who deliberately pinned the cloud to
 * "no on-device model is ready" would be technically true and practically useless.
 */
export function offlineError(options: { pinnedCloud: boolean }): AppError {
  if (options.pinnedCloud) {
    return appError(
      "NETWORK",
      "You pinned inference to the cloud, but the network is unavailable.",
      {
        hint: "Switch Mode to Auto to use this device while offline.",
        reason: "forced-cloud",
      },
    );
  }
  return appError(
    "OFFLINE_NO_DEVICE",
    "You are offline and no on-device model is ready.",
    { reason: "device-unavailable" },
  );
}
