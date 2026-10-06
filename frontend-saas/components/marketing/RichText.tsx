import type { ReactNode } from "react";

const INLINE_MARKDOWN = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;

function safeHref(href: string): string | null {
  const value = href.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^(https:\/\/|mailto:|tel:)/i.test(value)) return value;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const pattern = new RegExp(INLINE_MARKDOWN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${match.index}`;
    if (match[2] !== undefined) {
      const href = safeHref(match[3]);
      nodes.push(href
        ? <a key={key} href={href} className="underline underline-offset-2" rel={href.startsWith("https://") ? "noreferrer" : undefined}>{renderInline(match[2], key)}</a>
        : match[2]);
    } else if (match[4] !== undefined) nodes.push(<strong key={key}>{renderInline(match[4], key)}</strong>);
    else if (match[5] !== undefined) nodes.push(<u key={key}>{renderInline(match[5], key)}</u>);
    else if (match[6] !== undefined) nodes.push(<s key={key}>{renderInline(match[6], key)}</s>);
    else if (match[7] !== undefined) nodes.push(<code key={key} className="rounded bg-surface-secondary px-1 font-mono text-[0.9em]">{match[7]}</code>);
    else if (match[8] !== undefined) nodes.push(<em key={key}>{renderInline(match[8], key)}</em>);
    else if (match[9] !== undefined) nodes.push(<em key={key}>{renderInline(match[9], key)}</em>);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function renderRichText(value: string): ReactNode {
  const lines = value.split(/\r?\n/);
  const output: ReactNode[] = [];
  let listItems: string[] = [];
  let listKind: "ul" | "ol" = "ul";
  const flushList = () => {
    if (!listItems.length) return;
    const className = "my-2 space-y-1 pl-6";
    const items = listItems.map((item, index) => <li key={index}>{renderInline(item, `list-${output.length}-${index}`)}</li>);
    output.push(listKind === "ol"
      ? <ol key={`list-${output.length}`} className={`${className} list-decimal`}>{items}</ol>
      : <ul key={`list-${output.length}`} className={`${className} list-disc`}>{items}</ul>);
    listItems = [];
  };

  lines.forEach((line, index) => {
    const item = line.match(/^\s*(?:[-*]\s+|\d+\.\s+)(.+)$/);
    if (item) {
      const kind = /^\s*\d+\.\s+/.test(line) ? "ol" : "ul";
      if (listItems.length && kind !== listKind) flushList();
      listKind = kind;
      listItems.push(item[1]);
      return;
    }
    flushList();
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) output.push(<blockquote key={`quote-${index}`} className="my-2 border-l-2 border-primary pl-3 italic">{renderInline(quote[1], `quote-${index}`)}</blockquote>);
    else output.push(<span key={`line-${index}`}>{renderInline(line, `line-${index}`)}{index < lines.length - 1 && <br />}</span>);
  });
  flushList();
  return output;
}
