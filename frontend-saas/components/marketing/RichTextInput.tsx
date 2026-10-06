"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bold, Code2, Italic, Link2, List, ListOrdered, Quote, Strikethrough, Underline } from "lucide-react";

type FormatAction = "bold" | "italic" | "underline" | "strike" | "link" | "list" | "orderedList" | "quote" | "code";
type ToolbarItem = { action: FormatAction; label: string; title: string; icon: typeof Bold; multilineOnly?: boolean };

const toolbar: ToolbarItem[] = [
  { action: "bold", label: "Negrita", title: "Negrita (Ctrl+B)", icon: Bold },
  { action: "italic", label: "Cursiva", title: "Cursiva (Ctrl+I)", icon: Italic },
  { action: "underline", label: "Subrayado", title: "Subrayado (Ctrl+U)", icon: Underline },
  { action: "strike", label: "Tachado", title: "Tachado", icon: Strikethrough },
  { action: "code", label: "Código", title: "Código en línea", icon: Code2 },
  { action: "link", label: "Enlace", title: "Insertar o quitar enlace", icon: Link2 },
  { action: "list", label: "Viñetas", title: "Lista con viñetas", icon: List, multilineOnly: true },
  { action: "orderedList", label: "Numerada", title: "Lista numerada", icon: ListOrdered, multilineOnly: true },
  { action: "quote", label: "Cita", title: "Blockquote / cita", icon: Quote, multilineOnly: true },
];

function safeHref(href: string): boolean {
  const value = href.trim();
  return (value.startsWith("/") && !value.startsWith("//")) || /^(https:\/\/|mailto:|tel:)/i.test(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function markdownInlineToHtml(value: string): string {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, href: string) => safeHref(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : match);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  return html;
}

function markdownToHtml(value: string): string {
  const lines = value.split(/\r?\n/);
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(orderedList ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/);
        if (!match) break;
        items.push(`<li>${markdownInlineToHtml(match[1])}</li>`);
        index += 1;
      }
      const tag = orderedList ? "ol" : "ul";
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    if (/^\s*&gt;\s?/.test(escapeHtml(line))) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*&gt;/.test(escapeHtml(lines[index]))) {
        quoteLines.push(markdownInlineToHtml(lines[index].replace(/^\s*>\s?/, "")));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    blocks.push(markdownInlineToHtml(line) || "<br>");
    index += 1;
  }
  return blocks.join("<br>");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const content = Array.from(node.childNodes).map(nodeToMarkdown).join("");
  switch (node.tagName) {
    case "B": case "STRONG": return `**${content}**`;
    case "I": case "EM": return `*${content}*`;
    case "U": return `__${content}__`;
    case "S": case "STRIKE": case "DEL": return `~~${content}~~`;
    case "CODE": return `\`${node.textContent ?? ""}\``;
    case "A": {
      const href = node.getAttribute("href") ?? "";
      return safeHref(href) ? `[${content}](${href})` : content;
    }
    case "BR": return "\n";
    case "LI": return content.trim();
    case "UL": return Array.from(node.children).map((item) => `- ${nodeToMarkdown(item)}`).join("\n");
    case "OL": return Array.from(node.children).map((item, index) => `${index + 1}. ${nodeToMarkdown(item)}`).join("\n");
    case "BLOCKQUOTE": return content.trim().split(/\n+/).map((line) => `> ${line}`).join("\n");
    case "DIV": case "P": return `${content}\n`;
    default: return content;
  }
}

function selectionIsWithin(editor: HTMLElement, selector: string): boolean {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  const match = element?.closest(selector);
  return Boolean(match && editor.contains(match));
}

export function RichTextInput({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedValue = useRef<string | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<FormatAction>>(() => new Set());

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null;
      return;
    }
    editor.innerHTML = markdownToHtml(value);
  }, [value]);

  function updateActiveFormats() {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    if (!anchor || !editor.contains(anchor)) return;

    const next = new Set<FormatAction>();
    const queryCommandActive = (command: string) => {
      try { return document.queryCommandState(command); } catch { return false; }
    };
    if (queryCommandActive("bold")) next.add("bold");
    if (queryCommandActive("italic")) next.add("italic");
    if (queryCommandActive("underline")) next.add("underline");
    if (queryCommandActive("strikeThrough")) next.add("strike");
    if (selectionIsWithin(editor, "code")) next.add("code");
    if (selectionIsWithin(editor, "a")) next.add("link");
    if (selectionIsWithin(editor, "ul")) next.add("list");
    if (selectionIsWithin(editor, "ol")) next.add("orderedList");
    if (selectionIsWithin(editor, "blockquote")) next.add("quote");
    setActiveFormats(next);
  }

  useEffect(() => {
    document.addEventListener("selectionchange", updateActiveFormats);
    return () => document.removeEventListener("selectionchange", updateActiveFormats);
  });

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const next = nodeToMarkdown(editor).replace(/\n+$/, "");
    lastEmittedValue.current = next;
    onChange(next);
    requestAnimationFrame(updateActiveFormats);
  }

  function toggleInlineCode() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const code = selectionIsWithin(editor, "code")
      ? (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest("code")
      : null;
    if (code && editor.contains(code)) {
      const text = document.createTextNode(code.textContent ?? "");
      code.replaceWith(text);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(text);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    } else {
      const text = range.collapsed ? "código" : range.toString();
      const wrapper = document.createElement("code");
      wrapper.textContent = text;
      range.deleteContents();
      range.insertNode(wrapper);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(wrapper);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }
  }

  function apply(action: FormatAction) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (action === "link") {
      if (activeFormats.has("link")) {
        document.execCommand("unlink");
      } else {
        const href = window.prompt("Dirección del enlace (ruta interna o HTTPS):", "https://");
        if (!href || !safeHref(href)) return;
        document.execCommand("createLink", false, href.trim());
      }
    } else if (action === "list") {
      document.execCommand("insertUnorderedList");
    } else if (action === "orderedList") {
      document.execCommand("insertOrderedList");
    } else if (action === "quote") {
      document.execCommand("formatBlock", false, activeFormats.has("quote") ? "P" : "BLOCKQUOTE");
    } else if (action === "code") {
      toggleInlineCode();
    } else {
      const commands: Record<"bold" | "italic" | "underline" | "strike", string> = {
        bold: "bold", italic: "italic", underline: "underline", strike: "strikeThrough",
      };
      document.execCommand(commands[action]);
    }
    emitChange();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const action: FormatAction | null = key === "b" ? "bold" : key === "i" ? "italic" : key === "u" ? "underline" : key === "k" ? "link" : null;
    if (action) {
      event.preventDefault();
      apply(action);
    }
  }

  const activeLabels = toolbar.filter((item) => activeFormats.has(item.action)).map((item) => item.label);

  return (
    <div className="block min-w-0 text-sm font-medium text-foreground">
      <span>{label}</span>
      <div className="mt-1 overflow-hidden rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-primary/40">
        <div role="toolbar" aria-label={`Formato para ${label}`} className="flex flex-wrap gap-1 border-b border-border bg-surface-secondary/40 p-1">
          {toolbar.map((item) => {
            const Icon = item.icon;
            const active = activeFormats.has(item.action);
            return (
              <button
                key={item.action}
                type="button"
                title={item.title}
                aria-label={item.title}
                aria-pressed={active}
                disabled={item.multilineOnly && !multiline}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(item.action)}
                className={`inline-flex min-h-8 items-center gap-1 rounded px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-foreground-secondary hover:bg-surface-hover"}`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span className={item.action === "bold" ? "font-bold" : item.action === "italic" ? "italic" : item.action === "underline" ? "underline" : item.action === "strike" ? "line-through" : ""}>{item.label}</span>
              </button>
            );
          })}
          <span aria-live="polite" className="self-center px-1 text-[11px] font-normal text-foreground-muted">
            {activeLabels.length ? `Activo en el cursor: ${activeLabels.join(", ")}` : "Sin formato activo en el cursor"}
          </span>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={label}
          aria-multiline={multiline}
          onInput={emitChange}
          onKeyDown={onKeyDown}
          onKeyUp={updateActiveFormats}
          onMouseUp={updateActiveFormats}
          onFocus={updateActiveFormats}
          className={`min-h-10 w-full px-3 py-2 font-normal outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-surface-secondary [&_code]:px-1 [&_code]:font-mono [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal ${multiline ? "min-h-24 whitespace-pre-wrap" : "whitespace-nowrap"}`}
        />
      </div>
      <p className="mt-1 text-xs font-normal text-foreground-muted">Selecciona texto o ubica el cursor para ver los formatos activos.</p>
    </div>
  );
}
