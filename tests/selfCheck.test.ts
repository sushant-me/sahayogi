// @vitest-environment jsdom
/**
 * The self-check reports what it finds, including the ugly cases: no config, no
 * identity, a Firestore that accepts writes but hands nothing back. Those branches are
 * pinned here so the card cannot quietly start saying "all clear" when it is not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  uid: "uid-123456789" as string | null,
  authError: null as string | null,
  docExists: true,
  policyRemote: true,
  appCheckThrows: false,
  firestoreThrows: false,
}));

vi.mock("../src/firebase/config", () => ({
  get isFirebaseConfigured() {
    return state.configured;
  },
  get configDiagnostics() {
    return {
      projectId: state.configured ? "demo-project" : null,
      missing: state.configured ? [] : ["VITE_FIREBASE_API_KEY"],
    };
  },
  ensureAnonymousUser: async () => ({ uid: state.uid, error: state.authError }),
  initAppCheck: () => ({ __appCheck: true }),
  getDb: () => ({ __db: true }),
  fetchRoutingPolicyRaw: async () => ({
    raw: state.policyRemote ? '{"heavyThresholdChars":800}' : null,
    source: state.policyRemote ? "remote" : "default",
    error: state.policyRemote ? null : "network",
  }),
}));

vi.mock("firebase/app-check", () => ({
  getToken: async () => {
    if (state.appCheckThrows) throw new Error("attestation rejected");
    return { token: "token" };
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: () => ({ __ref: true }),
  setDoc: async () => {
    if (state.firestoreThrows) throw new Error("Missing or insufficient permissions");
  },
  getDoc: async () => ({ exists: () => state.docExists }),
  deleteDoc: async () => {},
}));

import { runSelfCheck } from "../src/lib/selfCheck";

const base = { online: true, deviceAvailability: "downloadable" as const, policySource: "remote" };

beforeEach(() => {
  state.configured = true;
  state.uid = "uid-123456789";
  state.authError = null;
  state.docExists = true;
  state.policyRemote = true;
  state.appCheckThrows = false;
  state.firestoreThrows = false;
});

describe("runSelfCheck", () => {
  it("passes the whole chain when everything is healthy", async () => {
    const results = await runSelfCheck(base);
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.config.status).toBe("pass");
    expect(byId.auth.status).toBe("pass");
    expect(byId.appcheck.status).toBe("pass");
    expect(byId.firestore.status).toBe("pass");
    expect(byId.policy.status).toBe("pass");
    // the device weights are not installed in this scenario, and that is a warn not a pass
    expect(byId.device.status).toBe("warn");
  });

  it("fails config and skips the rest when nothing is configured", async () => {
    state.configured = false;
    const results = await runSelfCheck(base);
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.config.status).toBe("fail");
    expect(byId.config.detail).toContain("VITE_FIREBASE_API_KEY");
    expect(byId.auth.detail).toContain("skipped");
    expect(byId.firestore.status).toBe("fail");
  });

  it("reports an auth failure with its message", async () => {
    state.uid = null;
    state.authError = "auth/admin-restricted-operation";
    const byId = Object.fromEntries((await runSelfCheck(base)).map((r) => [r.id, r]));
    expect(byId.auth.status).toBe("fail");
    expect(byId.auth.detail).toContain("admin-restricted-operation");
    // with no identity, history is local-only by design rather than broken
    expect(byId.firestore.status).toBe("warn");
  });

  it("fails when App Check cannot attest", async () => {
    state.appCheckThrows = true;
    const byId = Object.fromEntries((await runSelfCheck(base)).map((r) => [r.id, r]));
    expect(byId.appcheck.status).toBe("fail");
    expect(byId.appcheck.detail).toContain("attestation rejected");
  });

  it("fails when Firestore accepts the write but reads nothing back", async () => {
    state.docExists = false;
    const byId = Object.fromEntries((await runSelfCheck(base)).map((r) => [r.id, r]));
    expect(byId.firestore.status).toBe("fail");
    expect(byId.firestore.detail).toContain("read back nothing");
  });

  it("keeps the raw Firestore error instead of smoothing it", async () => {
    state.firestoreThrows = true;
    const byId = Object.fromEntries((await runSelfCheck(base)).map((r) => [r.id, r]));
    expect(byId.firestore.status).toBe("fail");
    expect(byId.firestore.detail).toContain("insufficient permissions");
  });

  it("warns when the policy came from built-in defaults", async () => {
    state.policyRemote = false;
    const byId = Object.fromEntries((await runSelfCheck(base)).map((r) => [r.id, r]));
    expect(byId.policy.status).toBe("warn");
    expect(byId.policy.detail).toContain("defaults");
  });

  it("marks the device check as a failure only when it is unsupported", async () => {
    const byId = Object.fromEntries(
      (await runSelfCheck({ ...base, deviceAvailability: "unsupported" })).map((r) => [r.id, r]),
    );
    expect(byId.device.status).toBe("warn");
    expect(byId.device.detail).toContain("no Prompt API");
  });

  it("warns offline rather than pretending the network is fine", async () => {
    const byId = Object.fromEntries((await runSelfCheck({ ...base, online: false })).map((r) => [r.id, r]));
    expect(byId.network.status).toBe("warn");
    expect(byId.network.detail).toContain("offline");
  });
});
