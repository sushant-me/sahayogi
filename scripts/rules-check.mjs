#!/usr/bin/env node
/**
 * Firestore rules check.
 *
 *   node scripts/rules-check.mjs
 *
 * The submission claims "owner-only rules". This proves it, from the outside, using only
 * public REST endpoints and an anonymous ID token — no admin credentials, no SDK.
 *
 * Cases:
 *   1. a user can write and read under their own uid            → allowed
 *   2. a user can delete under their own uid                    → allowed
 *   3. a user cannot read another user's chat                   → denied
 *   4. a user cannot write another user's chat                  → denied
 *   5. an unauthenticated request cannot read                   → denied
 *   6. a message can be appended but not edited or deleted       → create allowed, update/delete denied
 *   7. an unnamed subcollection under the user is closed         → denied
 *   8. the self-check probe path works, and a non-owner is denied
 *
 * Exits non-zero if any expectation is not met.
 */

const PROJECT = "hackthon-dcdf7";
const DATABASE = process.env.FIRESTORE_DB ?? "default";
const API_KEY = process.env.FIREBASE_API_KEY;
if (!API_KEY) {
  console.error("FIREBASE_API_KEY is required (the web API key from the Firebase project).");
  process.exit(2);
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents`;
const results = [];

function record(name, expected, status, body) {
  const denied = status === 403 || status === 401;
  const ok = expected === "deny" ? denied : status >= 200 && status < 300;
  results.push({ name, ok, detail: `HTTP ${status}${ok ? "" : " — " + JSON.stringify(body).slice(0, 160)}` });
}

async function signUpAnonymous() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok || !body.idToken) {
    throw new Error(`anonymous sign-up failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { idToken: body.idToken, uid: body.localId };
}

const field = (value) => ({ stringValue: value });

async function main() {
  const attacker = await signUpAnonymous();
  const victim = await signUpAnonymous();
  console.log(`signed in ${attacker.uid.slice(0, 8)}… (attacker) and ${victim.uid.slice(0, 8)}… (victim)\n`);

  const auth = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  // 1 — own document is writable
  const ownPath = `${BASE}/users/${attacker.uid}/chats/rulescheck?key=${API_KEY}`;
  let response = await fetch(ownPath, {
    method: "PATCH",
    headers: auth(attacker.idToken),
    body: JSON.stringify({ fields: { title: field("rules check") } }),
  });
  record("own document: write", "allow", response.status, await response.json().catch(() => ({})));

  // 2 — own document is readable back
  response = await fetch(ownPath, { headers: auth(attacker.idToken) });
  record("own document: read", "allow", response.status, await response.json().catch(() => ({})));

  // 3 — another user's document is not readable
  const victimPath = `${BASE}/users/${victim.uid}/chats/rulescheck?key=${API_KEY}`;
  response = await fetch(victimPath, { headers: auth(attacker.idToken) });
  record("another user's document: read", "deny", response.status, await response.json().catch(() => ({})));

  // 4 — another user's document is not writable
  response = await fetch(victimPath, {
    method: "PATCH",
    headers: auth(attacker.idToken),
    body: JSON.stringify({ fields: { title: field("injected") } }),
  });
  record("another user's document: write", "deny", response.status, await response.json().catch(() => ({})));

  // 5 — no token at all is not readable
  response = await fetch(`${BASE}/users/${victim.uid}/chats/rulescheck?key=${API_KEY}`);
  record("unauthenticated: read", "deny", response.status, await response.json().catch(() => ({})));

  // 6 — messages are append-only
  const messagePath = `${BASE}/users/${attacker.uid}/chats/rulescheck/messages/m1?key=${API_KEY}`;
  response = await fetch(messagePath, {
    method: "PATCH",
    headers: auth(attacker.idToken),
    body: JSON.stringify({ fields: { text: field("an answer"), role: field("model") } }),
  });
  record("own message: append", "allow", response.status, await response.json().catch(() => ({})));

  response = await fetch(messagePath, {
    method: "PATCH",
    headers: auth(attacker.idToken),
    body: JSON.stringify({ fields: { text: field("rewritten evidence"), role: field("model") } }),
  });
  record("own message: edit", "deny", response.status, await response.json().catch(() => ({})));

  response = await fetch(messagePath, { method: "DELETE", headers: auth(attacker.idToken) });
  record("own message: delete", "deny", response.status, response.status === 200 ? {} : {});

  // 7 — an unnamed subcollection is closed, not inherited
  response = await fetch(`${BASE}/users/${attacker.uid}/private/thing?key=${API_KEY}`, {
    method: "PATCH",
    headers: auth(attacker.idToken),
    body: JSON.stringify({ fields: { note: field("should not be allowed") } }),
  });
  record("unnamed subcollection: write", "deny", response.status, await response.json().catch(() => ({})));

  // 8 — the self-check probe path is usable by its owner and closed to others
  const checkPath = `${BASE}/users/${attacker.uid}/selfChecks/c1?key=${API_KEY}`;
  response = await fetch(checkPath, {
    method: "PATCH",
    headers: auth(attacker.idToken),
    body: JSON.stringify({ fields: { at: field("now") } }),
  });
  record("self-check probe path: write", "allow", response.status, await response.json().catch(() => ({})));

  response = await fetch(`${BASE}/users/${victim.uid}/selfChecks/c1?key=${API_KEY}`, {
    headers: auth(attacker.idToken),
  });
  record("another user's self-check: read", "deny", response.status, await response.json().catch(() => ({})));

  // 9 — cleaning up after yourself works
  response = await fetch(ownPath, { method: "DELETE", headers: auth(attacker.idToken) });
  record("own document: delete", "allow", response.status, response.status === 200 ? {} : {});
}

try {
  await main();
} catch (error) {
  console.error("rules check could not run:", error.message);
  process.exit(2);
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name.padEnd(34)} ${result.detail}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} case(s) did not meet the expectation` : "\nrules behave as claimed");
process.exit(failed ? 1 : 0);
