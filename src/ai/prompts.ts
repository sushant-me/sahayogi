/** Prompt templates and the shared system instruction. */

export const SYSTEM_INSTRUCTION = [
  "You are Sahayogi, a study assistant for students preparing for exams.",
  "Be concise and concrete. Prefer short paragraphs and bullet lists.",
  "When a question is ambiguous, state the assumption you made in one line.",
  "Never invent citations, page numbers, or statistics.",
  "If you are unsure, say what you do know and what would settle it.",
].join(" ");

export function chatPrompt(question: string): string {
  return question.trim();
}

export function flashcardsPrompt(notes: string): string {
  return [
    "Turn the study notes below into 8 flashcards for active recall.",
    "Return ONLY a JSON array, no prose, no code fences.",
    'Each item must be {"front": string, "back": string}.',
    "Front is a short question or term. Back is the answer in at most 25 words.",
    "",
    "NOTES:",
    notes.trim(),
  ].join("\n");
}

export function examPrompt(notes: string, count = 10): string {
  return [
    `Write a ${count}-question practice exam from the notes below.`,
    "Mix 60% short answer and 40% multiple choice (4 options, mark the correct letter).",
    "After the questions, add an answer key with a one-line explanation each.",
    "Use markdown headings: '## Questions' and '## Answer key'.",
    "",
    "NOTES:",
    notes.trim(),
  ].join("\n");
}

export function summaryPrompt(text: string): string {
  return [
    "Summarise the following document for exam revision.",
    "Output: 5 key points, then 3 likely exam questions, then 3 terms with definitions.",
    "",
    "DOCUMENT:",
    text.trim(),
  ].join("\n");
}

export interface Flashcard {
  front: string;
  back: string;
}

export function taskPrompt(task: "chat" | "flashcards" | "exam" | "long-summary", text: string): string {
  switch (task) {
    case "flashcards":
      return flashcardsPrompt(text);
    case "exam":
      return examPrompt(text);
    case "long-summary":
      return summaryPrompt(text);
    case "chat":
      return chatPrompt(text);
  }
}
