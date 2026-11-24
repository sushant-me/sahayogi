// @vitest-environment jsdom
/**
 * The storage guard.
 *
 * A browser that refuses storage can refuse it with a *throwing getter*, which is what made the
 * app fail to render entirely before this module existed. These tests pin the guarantee that
 * matters: no storage means "no storage", never an exception that takes the page down.
 */
import { afterEach, describe, expect, it } from "vitest";

import { getStorage, readJSON, readString, removeKey, writeJSON, writeString } from "../src/lib/storage";

const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

function breakStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("storage disabled", "SecurityError");
    },
  });
}

function restoreStorage() {
  if (originalDescriptor) Object.defineProperty(window, "localStorage", originalDescriptor);
}

afterEach(() => {
  restoreStorage();
  window.localStorage.clear();
});

describe("storage with a browser that refuses access", () => {
  it("reports no storage instead of throwing", () => {
    breakStorage();
    expect(getStorage()).toBeNull();
  });

  it("reads return null and writes are silent no-ops", () => {
    breakStorage();
    expect(readString("anything")).toBeNull();
    expect(readJSON("anything")).toBeNull();
    expect(() => writeString("anything", "value")).not.toThrow();
    expect(() => writeJSON("anything", { a: 1 })).not.toThrow();
    expect(() => removeKey("anything")).not.toThrow();
  });
});

describe("storage when it works", () => {
  it("round-trips strings and JSON", () => {
    expect(getStorage()).not.toBeNull();
    writeString("plain", "text");
    expect(readString("plain")).toBe("text");

    writeJSON("structured", { rows: [1, 2], nested: { ok: true } });
    expect(readJSON<{ rows: number[] }>("structured")?.rows).toEqual([1, 2]);
  });

  it("survives a corrupt JSON payload", () => {
    writeString("broken", "{not json");
    expect(readJSON("broken")).toBeNull();
  });

  it("removes keys", () => {
    writeString("gone", "x");
    removeKey("gone");
    expect(readString("gone")).toBeNull();
  });
});
