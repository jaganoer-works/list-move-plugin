const { Plugin } = require("obsidian");

const LIST_ITEM_RE = /^\s*(?:[-*+]\s|\d+[.)]\s|[-*+]\s\[[ xX]\]\s)/;

function normalizeIndent(leadingWhitespace) {
  // Treat tabs as 4 spaces for predictable indent comparisons.
  return leadingWhitespace.replace(/\t/g, "    ").length;
}

function getLineIndent(lineText) {
  const m = lineText.match(/^\s*/);
  return normalizeIndent(m ? m[0] : "");
}

function isListLine(lineText) {
  return LIST_ITEM_RE.test(lineText);
}

function getSelectionLines(editor) {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");

  const startLine = from.line;
  let endLine = to.line;

  // When selection ends at column 0 of the next line, treat it as previous line selected.
  if (to.ch === 0 && endLine > startLine) {
    endLine -= 1;
  }

  return {
    startLine,
    endLine,
    isMultiLine: endLine > startLine,
    from,
    to,
  };
}

function readLines(editor, start, end) {
  if (start > end) return [];
  const lines = [];
  for (let i = start; i <= end; i += 1) {
    lines.push(editor.getLine(i));
  }
  return lines;
}

function isBlankLineRange(editor, start, end) {
  if (start > end) return true;
  for (let i = start; i <= end; i += 1) {
    if (editor.getLine(i).trim() !== "") return false;
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
    if (startLine <= 0) return false;

    const above = editor.getLine(startLine - 1);
    const selected = readLines(editor, startLine, endLine);
    replaceLineRange(editor, startLine - 1, endLine, [...selected, above]);
    return true;
  }

  if (endLine >= lastLine) return false;

  const below = editor.getLine(endLine + 1);
  const selected = readLines(editor, startLine, endLine);
  replaceLineRange(editor, startLine, endLine + 1, [below, ...selected]);
  return true;
}

function findBlockEnd(editor, startLine, baseIndent) {
  const lastLine = editor.lineCount() - 1;
  let end = startLine;

  for (let i = startLine + 1; i <= lastLine; i += 1) {
    const line = editor.getLine(i);
    if (line.trim() === "") {
      break;
    }

    const indent = getLineIndent(line);
    if (indent > baseIndent) {
      end = i;
      continue;
    }

    break;
  }

  return end;
}

function findPrevSiblingStart(editor, currentStart, baseIndent) {
  for (let i = currentStart - 1; i >= 0; i -= 1) {
    const line = editor.getLine(i);
    if (!isListLine(line)) continue;

    const indent = getLineIndent(line);
    if (indent === baseIndent) {
      return i;
    }

    if (indent < baseIndent) {
      return null;
    }
  }

  return null;
}

function findNextSiblingStart(editor, currentEnd, baseIndent) {
  const lastLine = editor.lineCount() - 1;

  for (let i = currentEnd + 1; i <= lastLine; i += 1) {
    const line = editor.getLine(i);
    if (line.trim() === "") continue;
    if (!isListLine(line)) continue;

    const indent = getLineIndent(line);
    if (indent === baseIndent) {
      return i;
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
  if (!isListLine(lineText)) return false;

  const baseIndent = getLineIndent(lineText);
  const currentStart = currentLine;
  const currentEnd = findBlockEnd(editor, currentStart, baseIndent);

  if (direction === "up") {
    const prevStart = findPrevSiblingStart(editor, currentStart, baseIndent);
    if (prevStart == null) return false;

    const prevEnd = findBlockEnd(editor, prevStart, baseIndent);
    const separatorStart = prevEnd + 1;
    const separatorEnd = currentStart - 1;
    if (!isBlankLineRange(editor, separatorStart, separatorEnd)) return false;

    const prevBlock = readLines(editor, prevStart, prevEnd);
    const separator = readLines(editor, separatorStart, separatorEnd);
    const currBlock = readLines(editor, currentStart, currentEnd);
    replaceLineRange(editor, prevStart, currentEnd, [...currBlock, ...separator, ...prevBlock]);

    const lineOffsetInBlock = currentLine - currentStart;
    setCursorSafely(editor, prevStart + lineOffsetInBlock, cursor.ch);
    return true;
  }

  const nextStart = findNextSiblingStart(editor, currentEnd, baseIndent);
  if (nextStart == null) return false;

  const separatorStart = currentEnd + 1;
  const separatorEnd = nextStart - 1;
  if (!isBlankLineRange(editor, separatorStart, separatorEnd)) return false;

  const nextEnd = findBlockEnd(editor, nextStart, baseIndent);
  const currBlock = readLines(editor, currentStart, currentEnd);
  const separator = readLines(editor, separatorStart, separatorEnd);
  const nextBlock = readLines(editor, nextStart, nextEnd);
  replaceLineRange(editor, currentStart, nextEnd, [...nextBlock, ...separator, ...currBlock]);

  const lineOffsetInBlock = currentLine - currentStart;
  setCursorSafely(editor, currentStart + nextBlock.length + lineOffsetInBlock, cursor.ch);
  return true;
}

function executeMove(editor, direction) {
  const selection = getSelectionLines(editor);

  // Multi-line selection always moves as a contiguous line range.
  if (selection.isMultiLine) {
    const moved = moveLineRange(editor, selection.startLine, selection.endLine, direction);
    if (!moved) return;

    const delta = direction === "up" ? -1 : 1;
    setSelectionByLineRange(editor, selection.startLine + delta, selection.endLine + delta);
    return;
  }

  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);

  if (isListLine(lineText)) {
    const movedList = moveListBlock(editor, cursor, direction);
    if (movedList) return;
  }

  const movedLine = moveLineRange(editor, cursor.line, cursor.line, direction);
  if (!movedLine) return;

  const delta = direction === "up" ? -1 : 1;
  setCursorSafely(editor, cursor.line + delta, cursor.ch);
}

module.exports = class ListMovePlugin extends Plugin {
  onload() {
    this.addCommand({
      id: "move-list-up",
      name: "Move line or list item up",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowUp" }],
      editorCallback: (editor) => {
        executeMove(editor, "up");
      },
    });

    this.addCommand({
      id: "move-list-down",
      name: "Move line or list item down",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowDown" }],
      editorCallback: (editor) => {
        executeMove(editor, "down");
      },
    });
  }
};
