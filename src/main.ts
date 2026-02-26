import { App, Editor, EditorPosition, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

/**
 * 箇条書き・番号付き・タスクの各リスト行を判定する正規表現。
 */
const LIST_ITEM_RE = /^\s*(?:[-*+]\s|\d+[.)]\s|[-*+]\s\[[ xX]\]\s)/;

/**
 * コピーボタンを挿入する対象のコードブロック要素セレクタ。
 */
const COPY_TARGET_SELECTOR =
  ".markdown-reading-view .markdown-rendered pre, .markdown-source-view.mod-cm6 .cm-preview-code-block pre";

/**
 * コピーボタン要素に付与するクラス名。
 */
const COPY_BUTTON_CLASS = "list-move-plugin-copy-button";

/**
 * コピーボタンのホスト要素を識別する属性名。
 */
const COPY_BUTTON_MARKER_ATTR = "data-list-move-copy-ready";

/**
 * ホスト要素の `position` を本プラグインが設定したことを識別する属性名。
 */
const COPY_POSITION_MARKER_ATTR = "data-list-move-copy-position-set";

/**
 * 移動方向を表すユニオン型。
 */
type MoveDirection = "up" | "down";

/**
 * プラグイン設定の永続データ構造。
 */
interface ListMovePluginSettings {
  /**
   * 単一カーソル時にリスト行をブロック単位で移動するか。
   */
  preferListBlockMove: boolean;
}

/**
 * プラグイン設定のデフォルト値。
 */
const DEFAULT_SETTINGS: ListMovePluginSettings = {
  preferListBlockMove: true,
};

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
 * コードブロック要素からコピー対象テキストを取得する。
 *
 * @param codeBlockEl - `pre` 要素。
 * @returns コピー対象の文字列。
 */
function getCodeBlockText(codeBlockEl: HTMLElement): string {
  const codeEl = codeBlockEl.querySelector("code");
  if (codeEl != null && codeEl.textContent != null) {
    return codeEl.textContent;
  }
  return codeBlockEl.textContent ?? "";
}

/**
 * 文字列をクリップボードに書き込む。
 * `navigator.clipboard` が利用できない環境では `execCommand` にフォールバックする。
 *
 * @param text - コピーする文字列。
 * @returns 書き込み成功時は true。
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText != null) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // noop: フォールバック処理へ進む
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

/**
 * 対象コードブロックへコピーボタンを追加する。
 *
 * @param codeBlockEl - `pre` 要素。
 */
function attachCopyButton(codeBlockEl: HTMLElement): void {
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
      new Notice("コピー対象のコードがありません");
      return;
    }

    const copied = await copyTextToClipboard(text);
    if (!copied) {
      new Notice("コードのコピーに失敗しました");
      return;
    }

    new Notice("コードをコピーしました");
  });

  codeBlockEl.appendChild(buttonEl);
}

/**
 * 指定コンテナ内に追加済みのコピーボタン関連要素を撤去する。
 *
 * @param containerEl - 探索対象コンテナ。
 */
function clearCopyButtons(containerEl: ParentNode): void {
  const hosts = containerEl.querySelectorAll<HTMLElement>(`[${COPY_BUTTON_MARKER_ATTR}="true"]`);
  for (const host of hosts) {
    const buttons = host.querySelectorAll<HTMLElement>(`.${COPY_BUTTON_CLASS}`);
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

/**
 * 指定コンテナ内のコードブロックにコピーボタンを追加する。
 *
 * @param containerEl - 探索対象コンテナ。
 */
function decorateCopyButtons(containerEl: ParentNode): void {
  const codeBlocks = containerEl.querySelectorAll<HTMLElement>(COPY_TARGET_SELECTOR);
  for (const codeBlock of codeBlocks) {
    attachCopyButton(codeBlock);
  }
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
 * @param preferListBlockMove - 単一カーソル時にリスト行のブロック移動を優先するか。
 * true の場合はブロック移動のみを行い、失敗時に1行移動へはフォールバックしない。
 */
function executeMove(editor: Editor, direction: MoveDirection, preferListBlockMove: boolean): void {
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

  if (preferListBlockMove && isListLine(lineText)) {
    const movedList = moveListBlock(editor, cursor, direction);
    if (movedList) {
      return;
    }
    new Notice("同一階層の移動先がないため、リストブロックを移動できません");
    return;
  }

  const movedLine = moveLineRange(editor, cursor.line, cursor.line, direction);
  if (!movedLine) {
    return;
  }

  const delta = direction === "up" ? -1 : 1;
  setCursorSafely(editor, cursor.line + delta, cursor.ch);
}

/**
 * `list-move-plugin` の設定タブ。
 */
class ListMovePluginSettingTab extends PluginSettingTab {
  /**
   * 設定値を保持するプラグイン本体。
   */
  private readonly plugin: ListMovePlugin;

  /**
   * 設定タブを初期化する。
   *
   * @param app - Obsidian アプリケーションインスタンス。
   * @param plugin - 設定値を保持するプラグイン本体。
   */
  constructor(app: App, plugin: ListMovePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * 設定画面を描画する。
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("単一リスト行をブロック単位で移動")
      .setDesc("オフにすると、リスト行でも常に1行単位で移動します。")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.preferListBlockMove);
        toggle.onChange(async (value: boolean) => {
          this.plugin.settings.preferListBlockMove = value;
          await this.plugin.saveSettings();
        });
      });
  }
}

/**
 * Obsidian プラグインのエントリクラス。
 */
export default class ListMovePlugin extends Plugin {
  /**
   * 現在のプラグイン設定。
   */
  settings: ListMovePluginSettings = DEFAULT_SETTINGS;

  /**
   * コードブロック検知用の DOM 監視インスタンス。
   */
  private copyButtonObserver: MutationObserver | null = null;

  /**
   * 永続化された設定を読み込み、未定義項目はデフォルト値で補完する。
   */
  private async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded as Partial<ListMovePluginSettings> | null),
    };
  }

  /**
   * 現在の設定を永続化する。
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * コードブロックへのコピーボタン付与処理を初期化する。
   */
  private initializeCopyButtonFeature(): void {
    decorateCopyButtons(this.app.workspace.containerEl);

    this.copyButtonObserver = new MutationObserver((records: MutationRecord[]) => {
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
      subtree: true,
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
  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ListMovePluginSettingTab(this.app, this));

    this.initializeCopyButtonFeature();

    this.addCommand({
      id: "move-list-up",
      name: "Move line or list item up",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowUp" }],
      editorCallback: (editor: Editor) => {
        executeMove(editor, "up", this.settings.preferListBlockMove);
      },
    });

    this.addCommand({
      id: "move-list-down",
      name: "Move line or list item down",
      hotkeys: [{ modifiers: ["Alt"], key: "ArrowDown" }],
      editorCallback: (editor: Editor) => {
        executeMove(editor, "down", this.settings.preferListBlockMove);
      },
    });
  }
}
