// @vitest-environment jsdom
/**
 * The error boundary is the difference between a white screen and a score. It had never been
 * tested, which is exactly how boundaries rot: they get moved, nested under the wrong
 * provider, or the fallback itself throws.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../src/components/ErrorBoundary";

let shouldThrow = true;

function Exploding() {
  if (shouldThrow) throw new Error("routing table collapsed");
  return <p>recovered content</p>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs caught errors; keep the test output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <p>healthy content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy content")).toBeTruthy();
  });

  it("catches a render failure and shows something actionable", () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something broke while rendering")).toBeTruthy();
    expect(screen.getByText(/routing table collapsed/)).toBeTruthy();
    // the reassurance matters: a crash mid-answer should not read as data loss
    expect(screen.getByText(/saved chats and routing log are on disk/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("can re-render after the cause is gone, without a page reload", () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something broke while rendering")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try rendering again" }));

    expect(screen.getByText("recovered content")).toBeTruthy();
    expect(screen.queryByText("Something broke while rendering")).toBeNull();
  });

  it("does not swallow the error silently", () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });
});
