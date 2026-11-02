import type {
  ExcalidrawTextElement,
  TextStyleAttributes,
} from "@excalidraw/element/types";

/**
 * What the text style actions need from the text editor (see textWysiwyg)
 * while a text is edited.
 */
export type ActiveTextEditor = {
  elementId: ExcalidrawTextElement["id"];
  /** the editor's selection, in `originalText` offsets */
  getSelection: () => { start: number; end: number };
  /**
   * The style text typed at `at` takes instead of the one before it: set
   * when a style is toggled with a collapsed caret, until the caret moves.
   */
  pendingStyle: { at: number; style: TextStyleAttributes | null } | null;
};

/** the pending style, if the caret is still where it was set */
export const getPendingTextStyle = (editor: ActiveTextEditor, caret: number) =>
  editor.pendingStyle && editor.pendingStyle.at === caret
    ? editor.pendingStyle
    : null;
