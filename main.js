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
  /**
   * コマンドを登録してプラグインを初期化する。
   */
  onload() {
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
