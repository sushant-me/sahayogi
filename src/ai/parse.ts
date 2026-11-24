/**
 * Lenient structured-output parsing.
 *
 * On-device Gemini Nano does not reliably honour response schemas, so we ask for
 * JSON in the prompt and parse defensively: strip code fences, find the first
 * balanced array, validate each item, and drop bad entries instead of throwing.
 * A study tool that shows 7 good flashcards beats one that shows an error page.
 */

import type { Flashcard } from "./prompts";

function stripFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractFirstArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export interface FlashcardParseResult {
  cards: Flashcard[];
  /** Raw text when parsing failed entirely, so the UI can still show something. */
  fallbackText: string;
  ok: boolean;
}

export function parseFlashcards(raw: string): FlashcardParseResult {
  const cleaned = stripFences(raw);
  const jsonSlice = extractFirstArray(cleaned);
  const fallbackText = cleaned;

  if (!jsonSlice) return { cards: [], fallbackText, ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return { cards: [], fallbackText, ok: false };
  }

  if (!Array.isArray(parsed)) return { cards: [], fallbackText, ok: false };

  const cards: Flashcard[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    // Accept the requested keys and the common model variants.
    const front = asString(record.front) ?? asString(record.question) ?? asString(record.term);
    const back = asString(record.back) ?? asString(record.answer) ?? asString(record.definition);
    if (front && back) cards.push({ front, back });
  }

  return { cards, fallbackText, ok: cards.length > 0 };
}

/** Splits a model answer into question blocks for the quiz view. */
export function splitMarkdownSections(raw: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  const lines = raw.split("\n");
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = /^#{1,3}\s+(.*)$/.exec(line.trim());
    if (headingMatch) {
      if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
      current = { heading: headingMatch[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      current = { heading: "", body: [line] };
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });

  return sections.filter((s) => s.body.length > 0);
}
