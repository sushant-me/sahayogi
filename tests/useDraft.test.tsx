// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearDraft, readDraft, useDraft, writeDraft } from "../src/state/useDraft";

function Input() {
  const [value, setValue] = useDraft("demo");
  return (
    <label>
      draft
      <input value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("drafts", () => {
  it("round-trips a value and clears it", () => {
    writeDraft("demo", "pasted notes");
    expect(readDraft("demo")).toBe("pasted notes");
    clearDraft("demo");
    expect(readDraft("demo")).toBe("");
  });

  it("restores a stored draft into the field", () => {
    writeDraft("demo", "half-typed question");
    render(<Input />);
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("half-typed question");
  });

  it("keeps the store in step as the user types", () => {
    render(<Input />);
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "new text" } });
    expect(readDraft("demo")).toBe("new text");
  });

  it("survives a storage that throws instead of breaking the page", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => writeDraft("demo", "x")).not.toThrow();
    window.localStorage.setItem = original;
  });
});
