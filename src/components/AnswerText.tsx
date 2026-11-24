/**
 * Answer rendering.
 *
 * Gemini writes markdown: headings, bullets, numbered lists, inline code. Flattening
 * that into one pre-wrapped blob makes study material hard to scan, so this renders
 * the small subset that actually appears — with React elements only, never
 * `dangerouslySetInnerHTML`, because model output is untrusted text.
 */

import type { ReactNode } from "react";

interface Block {
  kind: "heading" | "bullet" | "number" | "paragraph" | "code";
  text: string;
}

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      blocks.push({ kind: "paragraph", text: "" });
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      // a markdown horizontal rule is structure, not content
      blocks.push({ kind: "paragraph", text: "" });
      continue;
    }
    if (/^```/.test(trimmed)) {
      // fenced code delimiters carry no content of their own
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[1] });
      continue;
    }
    const numbered = /^(\d{1,2})[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      blocks.push({ kind: "number", text: `${numbered[1]}. ${numbered[2]}` });
      continue;
    }
    blocks.push({ kind: "paragraph", text: trimmed });
  }

  return blocks;
}

/** Inline `code` spans only; bold markers are already removed upstream. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-c${index}`}
          className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[12px] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}-t${index}`}>{part}</span>;
  });
}

export function AnswerText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const key = `b${i}`;

    if (block.kind === "paragraph" && block.text === "") {
      nodes.push(<div key={key} className="h-2" />);
      continue;
    }
    if (block.kind === "heading") {
      nodes.push(
        <p key={key} className="mt-2 text-[13.5px] font-semibold tracking-tight text-ink first:mt-0">
          {renderInline(block.text, key)}
        </p>,
      );
      continue;
    }
    if (block.kind === "bullet") {
      nodes.push(
        <div key={key} className="flex gap-2 pl-1">
          <span aria-hidden="true" className="select-none text-muted">
            •
          </span>
          <p className="flex-1 text-ink">{renderInline(block.text, key)}</p>
        </div>,
      );
      continue;
    }
    if (block.kind === "number") {
      const [num, ...rest] = block.text.split(" ");
      nodes.push(
        <div key={key} className="flex gap-2 pl-1">
          <span aria-hidden="true" className="select-none tabular-nums text-muted">
            {num}
          </span>
          <p className="flex-1 text-ink">{renderInline(rest.join(" "), key)}</p>
        </div>,
      );
      continue;
    }
    nodes.push(
      <p key={key} className="text-ink">
        {renderInline(block.text, key)}
      </p>,
    );
  }

  return <div className="space-y-1 text-[13.5px] leading-relaxed">{nodes}</div>;
}
