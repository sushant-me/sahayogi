// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnswerText } from "../src/components/AnswerText";

afterEach(() => cleanup());

describe("AnswerText", () => {
  it("renders bullets as separate lines", () => {
    render(<AnswerText text={"Intro line\n- first point\n- second point"} />);
    expect(screen.getByText("first point")).toBeTruthy();
    expect(screen.getByText("second point")).toBeTruthy();
  });

  it("renders headings with their hash markers removed", () => {
    render(<AnswerText text={"## Answer key\n1. Voltage"} />);
    expect(screen.getByText("Answer key")).toBeTruthy();
    expect(screen.queryByText(/##/)).toBeNull();
  });

  it("renders numbered items with the number kept visible", () => {
    render(<AnswerText text={"1. What is V?\n2. What is I?"} />);
    expect(screen.getByText("1.")).toBeTruthy();
    expect(screen.getByText("What is V?")).toBeTruthy();
  });

  it("renders inline code without a code fence leaking through", () => {
    render(<AnswerText text={"Use `V = IR` here"} />);
    expect(screen.getByText("V = IR")).toBeTruthy();
    expect(screen.queryByText(/`/)).toBeNull();
  });

  it("never interprets model output as HTML", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    render(<AnswerText text={hostile} />);
    // rendered as literal text, and no element was created from it
    expect(screen.getByText(hostile)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("keeps blank lines as spacing rather than dropping the paragraph break", () => {
    const { container } = render(<AnswerText text={"para one\n\npara two"} />);
    expect(screen.getByText("para one")).toBeTruthy();
    expect(screen.getByText("para two")).toBeTruthy();
    expect(container.querySelectorAll(".h-2").length).toBeGreaterThan(0);
  });
});
