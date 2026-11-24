#!/usr/bin/env node
/**
 * Pre-flight check.
 *
 * Answers one question before a demo or a submission: is this build actually able
 * to do what the README claims? It probes the real endpoints rather than trusting
 * configuration, and every failure prints the exact console step that fixes it.
 *
 * Usage:  npm run preflight
 * Exit:   0 = ready, 1 = something to fix (the table says what)
 *
 * No secrets are printed. The Firebase web API key is a public identifier, but it
 * is still displayed masked.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const results = [];
function record(name, status, detail, fix) {
  results.push({ name, status, detail, fix });
}

function readEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return null;
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnv();

// 1 — configuration present
const required = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"];
if (!env) {
  record("Firebase config", "FAIL", ".env.local not found", "cp .env.example .env.local and fill it from Project settings → Your apps.");
} else {
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    record("Firebase config", "FAIL", `missing ${missing.join(", ")}`, "Copy the web app config from the Firebase console.");
  } else {
    const key = env.VITE_FIREBASE_API_KEY;
    record("Firebase config", "PASS", `project ${env.VITE_FIREBASE_PROJECT_ID} · key ${key.slice(0, 6)}…${key.slice(-4)}`);
  }
}

const projectId = env?.VITE_FIREBASE_PROJECT_ID;
const apiKey = env?.VITE_FIREBASE_API_KEY;

// 2 — AI Logic enabled and answering
async function checkAiLogic() {
  if (!projectId || !apiKey) return record("AI Logic", "SKIP", "no config");
  const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${projectId}/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }] });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    return record("AI Logic", "FAIL", `request failed: ${error.message}`, "Check connectivity.");
  }

  const text = await response.text();

  if (response.ok) {
    let reply = "";
    try {
      reply = JSON.parse(text).candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    } catch {
      /* keep empty */
    }
    return record("AI Logic", "PASS", `model answered: "${reply.trim().slice(0, 40)}"`);
  }

  const disabled = /has not been used in project|service_disabled/i.test(text);
  const denied = /permission denied|access_denied/i.test(text);

  if (response.status === 403 && (disabled || denied)) {
    return record(
      "AI Logic",
      "FAIL",
      disabled
        ? "403 SERVICE_DISABLED — the AI Logic API has never been enabled for this project"
        : "403 ACCESS_DENIED — firebasevertexai.googleapis.com refuses this project",
      "Console → AI Logic → Get started → Gemini Developer API → Get started with this API → Enable API (this accepts the Gemini API terms).",
    );
  }
  if (response.status === 403) {
    return record(
      "AI Logic",
      "FAIL",
      "403 — the request was refused by the service",
      "Check that AI Logic is enabled and that App Check is configured for this origin.",
    );
  }
  if (response.status === 400) {
    // The service answered, which means it is enabled; the payload was just wrong.
    return record("AI Logic", "PASS", "service reachable (rejected the probe payload, which means it is enabled)");
  }
  if (response.status === 404) {
    return record("AI Logic", "FAIL", `404 — model id or project path not found`, "Check routing_policy.cloudModel against the models available to your project.");
  }
  return record("AI Logic", "FAIL", `HTTP ${response.status}`, text.slice(0, 120));
}

// 3 — anonymous auth
async function checkAuth() {
  if (!apiKey) return record("Anonymous auth", "SKIP", "no config");
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await response.json();
    if (json.idToken) return record("Anonymous auth", "PASS", "sign-up returned an ID token");
    const message = json?.error?.message ?? "unknown";
    if (message === "CONFIGURATION_NOT_FOUND") {
      return record("Anonymous auth", "FAIL", "Authentication is not initialised for this project", "Console → Authentication → Get started (this may ask to upgrade to Identity Platform).");
    }
    if (/OPERATION_NOT_ALLOWED|ADMIN_ONLY_OPERATION/.test(message)) {
      return record("Anonymous auth", "FAIL", "the Anonymous provider is disabled", "Console → Authentication → Sign-in method → Anonymous → Enable → Save.");
    }
    return record("Anonymous auth", "FAIL", message, "See the console's Authentication section.");
  } catch (error) {
    return record("Anonymous auth", "FAIL", `request failed: ${error.message}`, "Check connectivity.");
  }
}

// 4 — App Check configuration (client-side evidence only; the token must be registered)
function checkAppCheck() {
  if (!env) return record("App Check", "SKIP", "no config");
  const siteKey = env.VITE_APP_CHECK_SITE_KEY;
  const debug = env.VITE_APP_CHECK_DEBUG === "true";
  const token = env.VITE_APP_CHECK_DEBUG_TOKEN;
  if (siteKey) return record("App Check", "PASS", `${env.VITE_APP_CHECK_PROVIDER || "enterprise"} provider configured`);
  if (debug && token) return record("App Check", "WARN", "debug token set — make sure THIS exact token is registered in the console", "Console → App Check → Apps → Manage debug tokens.");
  if (debug) return record("App Check", "WARN", "debug mode with no fixed token — Chrome will generate one on first load", "Run the app once, copy the printed token, register it, then set VITE_APP_CHECK_DEBUG_TOKEN.");
  return record("App Check", "FAIL", "not configured", "Register the web app under App Check with a reCAPTCHA Enterprise key, or use a debug token.");
}

// 5 — on-device capability cannot be probed from Node
function checkDevice() {
  record(
    "On-device model",
    "MANUAL",
    "must be checked in the browser",
    'Chrome DevTools: typeof LanguageModel → "function"; await LanguageModel.availability() → "available"',
  );
}

console.log(`\n${C.bold}Sahayogi pre-flight${C.reset} ${C.dim}(${new Date().toISOString()})${C.reset}\n`);

await checkAiLogic();
await checkAuth();
checkAppCheck();
checkDevice();

const COLOR = { PASS: C.green, FAIL: C.red, WARN: C.yellow, MANUAL: C.cyan, SKIP: C.dim };
for (const r of results) {
  const color = COLOR[r.status] ?? C.reset;
  console.log(`${color}${r.status.padEnd(6)}${C.reset} ${r.name.padEnd(18)} ${C.dim}${r.detail}${C.reset}`);
  if (r.fix && r.status !== "PASS") console.log(`       ${C.dim}→ ${r.fix}${C.reset}`);
}

const failed = results.filter((r) => r.status === "FAIL");
const warned = results.filter((r) => r.status === "WARN");
console.log(
  `\n${failed.length ? C.red + `${failed.length} blocking issue(s)` : C.green + "ready"}${
    warned.length ? C.yellow + ` · ${warned.length} warning(s)` : ""
  }${C.reset}\n`,
);

process.exit(failed.length > 0 ? 1 : 0);
