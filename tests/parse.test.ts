import { describe, expect, it } from "vitest";

import { parseFlashcards, splitMarkdownSections } from "../src/ai/parse";

describe("parseFlashcards", () => {
  it("parses a clean JSON array", () => {
    const result = parseFlashcards(
      '[{"front":"Ohm law?","back":"V = IR"},{"front":"Unit of R?","back":"ohm"}]',
    );
    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({ front: "Ohm law?", back: "V = IR" });
  });

  it("strips markdown code fences", () => {
    const result = parseFlashcards('```json\n[{"front":"a","back":"b"}]\n```');
    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(1);
  });

  it("extracts the array from surrounding prose", () => {
    const result = parseFlashcards('Here you go:\n[{"front":"a","back":"b"}]\nHope that helps!');
    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(1);
  });

  it("accepts question/answer key variants", () => {
    const result = parseFlashcards('[{"question":"Why?","answer":"Because."}]');
    expect(result.cards[0]).toEqual({ front: "Why?", back: "Because." });
  });

  it("accepts term/definition key variants", () => {
    const result = parseFlashcards('[{"term":"Volt","definition":"Unit of potential"}]');
    expect(result.cards[0]).toEqual({ front: "Volt", back: "Unit of potential" });
  });

  it("drops incomplete entries instead of failing the whole batch", () => {
    const result = parseFlashcards('[{"front":"a","back":"b"},{"front":"only front"},{"back":"only back"}]');
    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(1);
  });

  it("returns the raw text when the model wrote prose", () => {
    const result = parseFlashcards("1. Ohm's law: V = IR\n2. Kirchhoff: sum of voltages is zero");
    expect(result.ok).toBe(false);
    expect(result.cards).toHaveLength(0);
    expect(result.fallbackText).toContain("Ohm's law");
  });

  it("returns the raw text for unterminated JSON", () => {
    const result = parseFlashcards('[{"front":"a","back":"b"}');
    expect(result.ok).toBe(false);
    expect(result.fallbackText.length).toBeGreaterThan(0);
  });

  it("handles brackets inside strings", () => {
    const result = parseFlashcards('[{"front":"Array [1,2]?","back":"A list"}]');
    expect(result.ok).toBe(true);
    expect(result.cards[0].front).toBe("Array [1,2]?");
  });

  it("treats an empty array as a parse failure", () => {
    const result = parseFlashcards("[]");
    expect(result.ok).toBe(false);
  });

  it("treats an empty string as a parse failure", () => {
    expect(parseFlashcards("").ok).toBe(false);
  });
});

describe("splitMarkdownSections", () => {
  it("splits on headings", () => {
    const sections = splitMarkdownSections("## Questions\n1. What is V?\n\n## Answer key\n1. Voltage");
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Questions");
    expect(sections[1].heading).toBe("Answer key");
  });

  it("keeps text before the first heading", () => {
    const sections = splitMarkdownSections("Intro line\n## Head\nbody");
    expect(sections[0].heading).toBe("");
    expect(sections[0].body).toContain("Intro line");
  });

  it("returns nothing for blank input", () => {
    expect(splitMarkdownSections("   \n  ")).toHaveLength(0);
  });

  it("drops heading-only sections", () => {
    const sections = splitMarkdownSections("## A\n## B\ntext");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("B");
  });
});
