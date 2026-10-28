import { Fragment, type ReactNode } from "react";

/** Formato sencillo de los mensajes: negrita, cursiva, tachado, código, listas y citas. */
export function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const tokenPattern = /(\*\*.+?\*\*|__.+?__|~~.+?~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const inner = token.startsWith("**") || token.startsWith("__") || token.startsWith("~~") || token.startsWith("`")
      ? token.slice(2, -2)
      : token.slice(1, -1);
    const key = `${keyPrefix}-${tokenIndex++}`;
    if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{renderInlineMarkdown(inner, key)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<s key={key}>{renderInlineMarkdown(inner, key)}</s>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-manila px-1 py-0.5 font-mono text-[0.9em]">{inner}</code>);
    else nodes.push(<em key={key}>{renderInlineMarkdown(inner, key)}</em>);
    cursor = index + token.length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

export function renderMessageMarkdown(value: string): ReactNode {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let quote: string[] = [];
  let blockIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blockIndex++}`} className="whitespace-pre-wrap">{paragraph.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{renderInlineMarkdown(line, `p-${blockIndex}-${index}`)}</Fragment>)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!listKind || !listItems.length) return;
    const List = listKind;
    blocks.push(<List key={`list-${blockIndex++}`} className={listKind === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>{listItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item, `li-${blockIndex}-${index}`)}</li>)}</List>);
    listItems = [];
    listKind = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(<blockquote key={`quote-${blockIndex++}`} className="border-l-2 border-line-strong pl-3 opacity-85">{quote.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{renderInlineMarkdown(line, `quote-${blockIndex}-${index}`)}</Fragment>)}</blockquote>);
    quote = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); flushList(); flushQuote(); continue; }
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) { flushParagraph(); flushList(); quote.push(quoteMatch[1]); continue; }
    flushQuote();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const nextKind = bulletMatch ? "ul" : numberedMatch ? "ol" : null;
    if (nextKind) {
      flushParagraph();
      if (listKind && listKind !== nextKind) flushList();
      listKind = nextKind;
      listItems.push((bulletMatch ?? numberedMatch)![1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList(); flushQuote();
  return <div className="space-y-1">{blocks}</div>;
}
