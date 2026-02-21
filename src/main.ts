import { Editor, EditorPosition, Plugin } from "obsidian";

/**
 * 箇条書き・番号付き・タスクの各リスト行を判定する正規表現。
 */
const LIST_ITEM_RE = /^\s*(?:[-*+]\s|\d+[.)]\s|[-*+]\s\[[ xX]\]\s)/;

/**
 * 移動方向を表すユニオン型。
 */
type MoveDirection = "up" | "down";

/**
 * 選択範囲を行単位で表現した情報。
 */
interface SelectionLines {
  startLine: number;
  endLine: number;
  isMultiLine: boolean;
}

/**
 * 行頭の空白を比較可能なインデント幅に変換する。
 * タブは常に4スペースとして扱い、判定を安定させる。
 *
 * @param leadingWhitespace - 行頭の空白部分。
 * @returns 正規化後のインデント幅。
 */
function normalizeIndent(leadingWhitespace: string): number {
  return leadingWhitespace.replace(/\t/g, "    ").length;
}

/**
 * 指定行のインデント幅を返す。
 *
 * @param lineText - エディタから取得した1行の文字列。
 * @returns 正規化後のインデント幅。
 */
function getLineIndent(lineText: string): number {
  const match = lineText.match(/^\s*/);
  return normalizeIndent(match ? match[0] : "");
}

/**
 * 行がリスト項目として扱われるかを判定する。
 *
 * @param lineText - エディタから取得した1行の文字列。
 * @returns サポート対象のリスト形式に一致する場合は true。
 */
function isListLine(lineText: string): boolean {
  return LIST_ITEM_RE.test(lineText);
}

/**
 * 現在の選択範囲を行単位の範囲として解決する。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @returns 正規化後の選択行メタデータ。
 */
function getSelectionLines(editor: Editor): SelectionLines {
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
    isMultiLine: endLine > startLine,
  };
}

/**
 * 指定した行範囲（両端含む）を配列として読み取る。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param start - 先頭行（含む）。
 * @param end - 末尾行（含む）。
 * @returns 取得した行文字列の配列。
 */
function readLines(editor: Editor, start: number, end: number): string[] {
  if (start > end) {
    return [];
  }

  const lines: string[] = [];
  for (let index = start; index <= end; index += 1) {
    lines.push(editor.getLine(index));
  }
  return lines;
}

/**
 * 指定範囲の行がすべて空行かを判定する。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param start - 先頭行（含む）。
 * @param end - 末尾行（含む）。
 * @returns すべて空行、または範囲が空の場合に true。
 */
function isBlankLineRange(editor: Editor, start: number, end: number): boolean {
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

/**
 * 指定した行範囲（両端含む）を新しい行配列で置き換える。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param start - 先頭行（含む）。
 * @param end - 末尾行（含む）。
 * @param lines - 置換後の行配列。
 */
function replaceLineRange(editor: Editor, start: number, end: number, lines: string[]): void {
  const from: EditorPosition = { line: start, ch: 0 };
  const to: EditorPosition = { line: end, ch: editor.getLine(end).length };
  editor.replaceRange(lines.join("\n"), from, to);
}

/**
 * 指定した行範囲（両端含む）を丸ごと選択状態にする。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param startLine - 選択開始行。
 * @param endLine - 選択終了行。
 */
function setSelectionByLineRange(editor: Editor, startLine: number, endLine: number): void {
  const anchor: EditorPosition = { line: startLine, ch: 0 };
  const head: EditorPosition = { line: endLine, ch: editor.getLine(endLine).length };
  editor.setSelection(anchor, head);
}

/**
 * 行長を超えないように補正しつつカーソルを移動する。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param line - 移動先の行番号。
 * @param ch - 希望する文字位置。
 */
function setCursorSafely(editor: Editor, line: number, ch: number): void {
  const lineLength = editor.getLine(line).length;
  editor.setCursor({ line, ch: Math.min(ch, lineLength) });
}

/**
 * 指定行範囲（両端含む）を方向に応じて1行分移動する。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param startLine - 先頭行（含む）。
 * @param endLine - 末尾行（含む）。
 * @param direction - 移動方向。
 * @returns 移動を適用できた場合は true。
 */
function moveLineRange(editor: Editor, startLine: number, endLine: number, direction: MoveDirection): boolean {
  const lastLine = editor.lineCount() - 1;

  if (direction === "up") {
    if (startLine <= 0) {
      return false;
    }

    const above = editor.getLine(startLine - 1);
    const selected = readLines(editor, startLine, endLine);
    replaceLineRange(editor, startLine - 1, endLine, [...selected, above]);
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

/**
 * 子要素のインデント規則に基づいて、リストブロックの終端行を求める。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param startLine - ブロック先頭行。
 * @param baseIndent - ブロック先頭行のインデント幅。
 * @returns ブロック終端行（含む）。
 */
function findBlockEnd(editor: Editor, startLine: number, baseIndent: number): number {
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

/**
 * 同一階層にある直前の兄弟リスト項目の開始行を求める。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param currentStart - 現在ブロックの開始行。
 * @param baseIndent - 現在ブロックのインデント幅。
 * @returns 兄弟項目の開始行。見つからない場合は null。
 */
function findPrevSiblingStart(editor: Editor, currentStart: number, baseIndent: number): number | null {
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

/**
 * 同一階層にある直後の兄弟リスト項目の開始行を求める。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param currentEnd - 現在ブロックの終端行。
 * @param baseIndent - 現在ブロックのインデント幅。
 * @returns 兄弟項目の開始行。見つからない場合は null。
 */
function findNextSiblingStart(editor: Editor, currentEnd: number, baseIndent: number): number | null {
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

/**
 * 現在のリストブロックを子要素ごと兄弟ブロック間で移動する。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param cursor - 現在のカーソル位置。
 * @param direction - 移動方向。
 * @returns 移動を適用できた場合は true。
 */
function moveListBlock(editor: Editor, cursor: EditorPosition, direction: MoveDirection): boolean {
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
    const separatorStart = prevEnd + 1;
    const separatorEnd = currentStart - 1;
    if (!isBlankLineRange(editor, separatorStart, separatorEnd)) {
      return false;
    }

    const prevBlock = readLines(editor, prevStart, prevEnd);
    const separator = readLines(editor, separatorStart, separatorEnd);
    const currentBlock = readLines(editor, currentStart, currentEnd);
    replaceLineRange(editor, prevStart, currentEnd, [...currentBlock, ...separator, ...prevBlock]);

    const lineOffsetInBlock = currentLine - currentStart;
    setCursorSafely(editor, prevStart + lineOffsetInBlock, cursor.ch);
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

/**
 * 複数行選択・リストブロック・単一行の順で移動処理を適用する。
 *
 * @param editor - Obsidian のエディタインスタンス。
 * @param direction - 移動方向。
 */
function executeMove(editor: Editor, direction: MoveDirection): void {
  const selection = getSelectionLines(editor);

  if (selection.isMultiLine) {
    const moved = moveLineRange(editor, selection.startLine, selection.endLine, direction);
    if (!moved) {
      return;
    }

    const delta = direction === "up" ? -1 : 1;
    setSelectionByLineRange(editor, selection.startLine + delta, selection.endLine + delta);
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

/**
 * Obsidian プラグインのエントリクラス。
 */
export default class ListMovePlugin extends Plugin {
  /**
   * コマンドを登録してプラグインを初期化する。
   */
  onload(): void {
    this.addCommand({
      id: "move-list-up",
      name: "Move line or list item up",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowUp" }],
      editorCallback: (editor: Editor) => {
        executeMove(editor, "up");
      },
    });

    this.addCommand({
      id: "move-list-down",
      name: "Move line or list item down",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowDown" }],
      editorCallback: (editor: Editor) => {
        executeMove(editor, "down");
      },
    });
  }
}
