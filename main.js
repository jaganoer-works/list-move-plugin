"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ListMovePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var LIST_ITEM_RE = /^\s*(?:[-*+]\s|\d+[.)]\s|[-*+]\s\[[ xX]\]\s)/;
var COPY_TARGET_SELECTOR = ".markdown-reading-view .markdown-rendered pre, .markdown-source-view.mod-cm6 .cm-preview-code-block pre";
var COPY_BUTTON_CLASS = "list-move-plugin-copy-button";
var COPY_BUTTON_MARKER_ATTR = "data-list-move-copy-ready";
var COPY_POSITION_MARKER_ATTR = "data-list-move-copy-position-set";
function normalizeIndent(leadingWhitespace) {
  return leadingWhitespace.replace(/\t/g, "    ").length;
}
function getLineIndent(lineText) {
  const match = lineText.match(/^\s*/);
  return normalizeIndent(match ? match[0] : "");
}
function isListLine(lineText) {
  return LIST_ITEM_RE.test(lineText);
}
function getSelectionLines(editor) {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const startLine = from.line;
  let endLine = to.line;
  if (to.ch === 0 && endLine > startLine) {
    endLine -= 1;
  }
  return {
    startLine,
    endLine,
    isMultiLine: endLine > startLine
  };
}
function readLines(editor, start, end) {
  if (start > end) {
    return [];
  }
  const lines = [];
  for (let index = start; index <= end; index += 1) {
    lines.push(editor.getLine(index));
  }
  return lines;
}
function isBlankLineRange(editor, start, end) {
  if (start > end) {
    return true;
  }
  for (let index = start; index <= end; index += 1) {
    if (editor.getLine(index).trim() !== "") {
      return false;
    }
  }
  return true;
}
function replaceLineRange(editor, start, end, lines) {
  const from = { line: start, ch: 0 };
  const to = { line: end, ch: editor.getLine(end).length };
  editor.replaceRange(lines.join("\n"), from, to);
}
function setSelectionByLineRange(editor, startLine, endLine) {
  const anchor = { line: startLine, ch: 0 };
  const head = { line: endLine, ch: editor.getLine(endLine).length };
  editor.setSelection(anchor, head);
}
function setCursorSafely(editor, line, ch) {
  const lineLength = editor.getLine(line).length;
  editor.setCursor({ line, ch: Math.min(ch, lineLength) });
}
function getCodeBlockText(codeBlockEl) {
  const codeEl = codeBlockEl.querySelector("code");
  if (codeEl != null && codeEl.textContent != null) {
    return codeEl.textContent;
  }
  return codeBlockEl.textContent ?? "";
}
async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText != null) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return succeeded;
}
function attachCopyButton(codeBlockEl) {
  if (codeBlockEl.getAttribute(COPY_BUTTON_MARKER_ATTR) === "true") {
    return;
  }
  codeBlockEl.setAttribute(COPY_BUTTON_MARKER_ATTR, "true");
  if (codeBlockEl.style.position === "") {
    codeBlockEl.style.position = "relative";
    codeBlockEl.setAttribute(COPY_POSITION_MARKER_ATTR, "true");
  }
  const buttonEl = document.createElement("button");
  buttonEl.type = "button";
  buttonEl.className = COPY_BUTTON_CLASS;
  buttonEl.textContent = "Copy";
  buttonEl.style.position = "absolute";
  buttonEl.style.top = "0.5em";
  buttonEl.style.right = "0.5em";
  buttonEl.style.zIndex = "1";
  buttonEl.style.fontSize = "12px";
  buttonEl.style.padding = "2px 8px";
  buttonEl.style.borderRadius = "6px";
  buttonEl.style.border = "1px solid var(--background-modifier-border)";
  buttonEl.style.background = "var(--background-primary)";
  buttonEl.style.cursor = "pointer";
  buttonEl.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = getCodeBlockText(codeBlockEl);
    if (text.length === 0) {
      new import_obsidian.Notice("\u30B3\u30D4\u30FC\u5BFE\u8C61\u306E\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093");
      return;
    }
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      new import_obsidian.Notice("\u30B3\u30FC\u30C9\u306E\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
      return;
    }
    new import_obsidian.Notice("\u30B3\u30FC\u30C9\u3092\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F");
  });
  codeBlockEl.appendChild(buttonEl);
}
function clearCopyButtons(containerEl) {
  const hosts = containerEl.querySelectorAll(`[${COPY_BUTTON_MARKER_ATTR}="true"]`);
  for (const host of hosts) {
    const buttons = host.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    for (const button of buttons) {
      button.remove();
    }
    host.removeAttribute(COPY_BUTTON_MARKER_ATTR);
    if (host.getAttribute(COPY_POSITION_MARKER_ATTR) === "true") {
      host.style.position = "";
      host.removeAttribute(COPY_POSITION_MARKER_ATTR);
    }
  }
}
function decorateCopyButtons(containerEl) {
  const codeBlocks = containerEl.querySelectorAll(COPY_TARGET_SELECTOR);
  for (const codeBlock of codeBlocks) {
    attachCopyButton(codeBlock);
  }
}
function moveLineRange(editor, startLine, endLine, direction) {
  const lastLine = editor.lineCount() - 1;
  if (direction === "up") {
    if (startLine <= 0) {
      return false;
    }
    const above = editor.getLine(startLine - 1);
    const selected2 = readLines(editor, startLine, endLine);
    replaceLineRange(editor, startLine - 1, endLine, [...selected2, above]);
    return true;
  }
  if (endLine >= lastLine) {
    return false;
  }
  const below = editor.getLine(endLine + 1);
  const selected = readLines(editor, startLine, endLine);
  replaceLineRange(editor, startLine, endLine + 1, [below, ...selected]);
  return true;
}
function findBlockEnd(editor, startLine, baseIndent) {
  const lastLine = editor.lineCount() - 1;
  let endLine = startLine;
  for (let index = startLine + 1; index <= lastLine; index += 1) {
    const line = editor.getLine(index);
    if (line.trim() === "") {
      break;
    }
    const indent = getLineIndent(line);
    if (indent > baseIndent) {
      endLine = index;
      continue;
    }
    break;
  }
  return endLine;
}
function findPrevSiblingStart(editor, currentStart, baseIndent) {
  for (let index = currentStart - 1; index >= 0; index -= 1) {
    const line = editor.getLine(index);
    if (!isListLine(line)) {
      continue;
    }
    const indent = getLineIndent(line);
    if (indent === baseIndent) {
      return index;
    }
    if (indent < baseIndent) {
      return null;
    }
  }
  return null;
}
function findNextSiblingStart(editor, currentEnd, baseIndent) {
  const lastLine = editor.lineCount() - 1;
  for (let index = currentEnd + 1; index <= lastLine; index += 1) {
    const line = editor.getLine(index);
    if (line.trim() === "") {
      continue;
    }
    if (!isListLine(line)) {
      continue;
    }
    const indent = getLineIndent(line);
    if (indent === baseIndent) {
      return index;
    }
    if (indent < baseIndent) {
      return null;
    }
  }
  return null;
}
function moveListBlock(editor, cursor, direction) {
  const currentLine = cursor.line;
  const lineText = editor.getLine(currentLine);
  if (!isListLine(lineText)) {
    return false;
  }
  const baseIndent = getLineIndent(lineText);
  const currentStart = currentLine;
  const currentEnd = findBlockEnd(editor, currentStart, baseIndent);
  if (direction === "up") {
    const prevStart = findPrevSiblingStart(editor, currentStart, baseIndent);
    if (prevStart == null) {
      return false;
    }
    const prevEnd = findBlockEnd(editor, prevStart, baseIndent);
    const separatorStart2 = prevEnd + 1;
    const separatorEnd2 = currentStart - 1;
    if (!isBlankLineRange(editor, separatorStart2, separatorEnd2)) {
      return false;
    }
    const prevBlock = readLines(editor, prevStart, prevEnd);
    const separator2 = readLines(editor, separatorStart2, separatorEnd2);
    const currentBlock2 = readLines(editor, currentStart, currentEnd);
    replaceLineRange(editor, prevStart, currentEnd, [...currentBlock2, ...separator2, ...prevBlock]);
    const lineOffsetInBlock2 = currentLine - currentStart;
    setCursorSafely(editor, prevStart + lineOffsetInBlock2, cursor.ch);
    return true;
  }
  const nextStart = findNextSiblingStart(editor, currentEnd, baseIndent);
  if (nextStart == null) {
    return false;
  }
  const separatorStart = currentEnd + 1;
  const separatorEnd = nextStart - 1;
  if (!isBlankLineRange(editor, separatorStart, separatorEnd)) {
    return false;
  }
  const nextEnd = findBlockEnd(editor, nextStart, baseIndent);
  const currentBlock = readLines(editor, currentStart, currentEnd);
  const separator = readLines(editor, separatorStart, separatorEnd);
  const nextBlock = readLines(editor, nextStart, nextEnd);
  replaceLineRange(editor, currentStart, nextEnd, [...nextBlock, ...separator, ...currentBlock]);
  const lineOffsetInBlock = currentLine - currentStart;
  setCursorSafely(editor, currentStart + nextBlock.length + lineOffsetInBlock, cursor.ch);
  return true;
}
function executeMove(editor, direction) {
  const selection = getSelectionLines(editor);
  if (selection.isMultiLine) {
    const moved = moveLineRange(editor, selection.startLine, selection.endLine, direction);
    if (!moved) {
      return;
    }
    const delta2 = direction === "up" ? -1 : 1;
    setSelectionByLineRange(editor, selection.startLine + delta2, selection.endLine + delta2);
    return;
  }
  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);
  if (isListLine(lineText)) {
    const movedList = moveListBlock(editor, cursor, direction);
    if (movedList) {
      return;
    }
  }
  const movedLine = moveLineRange(editor, cursor.line, cursor.line, direction);
  if (!movedLine) {
    return;
  }
  const delta = direction === "up" ? -1 : 1;
  setCursorSafely(editor, cursor.line + delta, cursor.ch);
}
var ListMovePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    /**
     * コードブロック検知用の DOM 監視インスタンス。
     */
    this.copyButtonObserver = null;
  }
  /**
   * コードブロックへのコピーボタン付与処理を初期化する。
   */
  initializeCopyButtonFeature() {
    decorateCopyButtons(this.app.workspace.containerEl);
    this.copyButtonObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          decorateCopyButtons(node);
          if (node.matches(COPY_TARGET_SELECTOR)) {
            attachCopyButton(node);
          }
        }
      }
    });
    this.copyButtonObserver.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true
    });
    this.register(() => {
      if (this.copyButtonObserver == null) {
        clearCopyButtons(this.app.workspace.containerEl);
        return;
      }
      this.copyButtonObserver.disconnect();
      this.copyButtonObserver = null;
      clearCopyButtons(this.app.workspace.containerEl);
    });
  }
  /**
   * コマンドを登録してプラグインを初期化する。
   */
  onload() {
    this.initializeCopyButtonFeature();
    this.addCommand({
      id: "move-list-up",
      name: "Move line or list item up",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowUp" }],
      editorCallback: (editor) => {
        executeMove(editor, "up");
      }
    });
    this.addCommand({
      id: "move-list-down",
      name: "Move line or list item down",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowDown" }],
      editorCallback: (editor) => {
        executeMove(editor, "down");
      }
    });
  }
};
