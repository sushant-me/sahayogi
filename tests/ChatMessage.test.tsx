// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatMessage } from "../src/components/ChatMessage";

afterEach(() => cleanup());

describe("ChatMessage retry affordance", () => {
  it("offers Try again on a failed answer", () => {
    const onRetry = vi.fn();
    render(
      <ChatMessage role="model" text="No answer. The free tier is rate-limited." onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not offer retry on a normal answer", () => {
    render(<ChatMessage role="model" text="Ohm's law relates voltage, current and resistance." />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the copy control alongside retry", () => {
    render(<ChatMessage role="model" text="partial" onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Copy answer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("ChatMessage live-region hygiene", () => {
  it("hides the ticking counter from assistive tech", () => {
    const { container } = render(<ChatMessage role="model" text="Thinking…" streaming statusSuffix="7s" />);
    const suffix = container.querySelector('[aria-hidden="true"]');
    expect(suffix?.textContent).toBe("7s");
    // the announced text stays stable, so a screen reader is not spammed every second
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });
});
