import { useEffect, useReducer } from "react";

import { KEYS } from "@excalidraw/common";

import {
  applyTextStyle,
  CaptureUpdateAction,
  getInheritedStyle,
  isTextElement,
  isTextStyleFlagActive,
  newElementWith,
  updateTextStyle,
} from "@excalidraw/element";

import type { TextStyleFlag, TextStyleUpdate } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import {
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "../components/icons";
import { RadioSelection } from "../components/RadioSelection";
import { t } from "../i18n";
import { getSelectedElements } from "../scene";
import { getPendingTextStyle } from "../wysiwyg/textEditorStyles";

import { changeProperty } from "./actionProperties";
import { register } from "./register";

import type { JSX } from "react";

import type { AppClassProperties, AppState } from "../types";
import type { ActionResult } from "./types";

const TEXT_STYLE_OPTIONS: {
  flag: TextStyleFlag;
  icon: JSX.Element;
  /** with CtrlOrCmd */
  key: string;
  shiftKey: boolean;
}[] = [
  { flag: "bold", icon: TextBoldIcon, key: KEYS.B, shiftKey: false },
  { flag: "italic", icon: TextItalicIcon, key: KEYS.I, shiftKey: false },
  { flag: "underline", icon: TextUnderlineIcon, key: KEYS.U, shiftKey: false },
  {
    flag: "strikethrough",
    icon: TextStrikethroughIcon,
    key: KEYS.X,
    shiftKey: true,
  },
];

/** the text being edited, with the editor's selection */
const getEditedText = (app: AppClassProperties, appState: AppState) => {
  const editor = app.text.activeTextEditor;
  const element = appState.editingTextElement
    ? app.scene.getElement(appState.editingTextElement.id)
    : null;
  if (!editor || !element || !isTextElement(element)) {
    return null;
  }
  if (editor.elementId !== element.id) {
    return null;
  }
  return { editor, element, selection: editor.getSelection() };
};

const getSelectedTextElements = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) =>
  getSelectedElements(elements, appState, {
    includeBoundTextElement: true,
  }).filter(isTextElement);

const isWholeTextStyleFlagActive = (
  element: ExcalidrawTextElement,
  flag: TextStyleFlag,
) =>
  !!element.originalText.length &&
  isTextStyleFlagActive(
    element.textStyles,
    element.originalText.length,
    0,
    element.originalText.length,
    flag,
  );

/**
 * Whether `flag` is on for what a text style change would apply to: the
 * editor's selection (or what's typed at its caret), else every selected
 * text.
 */
export const getTextStyleFlagState = (
  flag: TextStyleFlag,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: AppClassProperties,
) => {
  const edited = getEditedText(app, appState);
  if (edited) {
    const { editor, element, selection } = edited;
    if (selection.start === selection.end) {
      const pending = getPendingTextStyle(editor, selection.start);
      return pending
        ? !!pending.style?.[flag]
        : !!getInheritedStyle(element.textStyles, selection.start)?.[flag];
    }
    return isTextStyleFlagActive(
      element.textStyles,
      element.originalText.length,
      selection.start,
      selection.end,
      flag,
    );
  }
  const textElements = getSelectedTextElements(elements, appState);
  return (
    !!textElements.length &&
    textElements.every((element) => isWholeTextStyleFlagActive(element, flag))
  );
};

/**
 * Applies a style to the editor's selection, or, with a collapsed caret, to
 * what's typed next at it; else to the whole of every selected text.
 */
export const applyTextStyleUpdate = (
  update: TextStyleUpdate,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: AppClassProperties,
): ActionResult => {
  const edited = getEditedText(app, appState);
  if (edited) {
    const { editor, element, selection } = edited;
    if (selection.start === selection.end) {
      const current =
        getPendingTextStyle(editor, selection.start)?.style ??
        getInheritedStyle(element.textStyles, selection.start);
      editor.pendingStyle = {
        at: selection.start,
        style: updateTextStyle(current, update),
      };
      // re-render the styles panel
      return {
        appState: { ...appState },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
    return {
      elements: elements.map((el) =>
        el.id === element.id && isTextElement(el)
          ? newElementWith(el, {
              textStyles: applyTextStyle(
                el.textStyles,
                el.originalText.length,
                selection.start,
                selection.end,
                update,
              ),
            })
          : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  }

  return {
    elements: changeProperty(
      elements,
      appState,
      (el) =>
        isTextElement(el)
          ? newElementWith(el, {
              textStyles: applyTextStyle(
                el.textStyles,
                el.originalText.length,
                0,
                el.originalText.length,
                update,
              ),
            })
          : el,
      true,
    ),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

const toggleTextStyleFlag = (
  flag: TextStyleFlag,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: AppClassProperties,
) =>
  applyTextStyleUpdate(
    { [flag]: !getTextStyleFlagState(flag, elements, appState, app) },
    elements,
    appState,
    app,
  );

const canStyleText = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: AppClassProperties,
) =>
  !!getEditedText(app, appState) ||
  getSelectedTextElements(elements, appState).length > 0;

/** re-renders on the editor's caret moves, which aren't in the app state */
const useSelectionChange = (ownerDocument: Document, enabled: boolean) => {
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    ownerDocument.addEventListener("selectionchange", forceUpdate);
    return () =>
      ownerDocument.removeEventListener("selectionchange", forceUpdate);
  }, [ownerDocument, enabled]);
};

const TextStylePanel = ({
  elements,
  appState,
  updateData,
  app,
}: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  updateData: (flag: TextStyleFlag) => void;
  app: AppClassProperties;
}) => {
  useSelectionChange(app.ownerDocument, !!appState.editingTextElement);
  return (
    <fieldset>
      <legend>{t("labels.textStyle")}</legend>
      <div className="buttonList">
        <RadioSelection<TextStyleFlag>
          type="button"
          options={TEXT_STYLE_OPTIONS.map(({ flag, icon }) => ({
            value: flag,
            text: t(`labels.textStyle_${flag}`),
            icon,
            testId: `text-style-${flag}`,
            active: getTextStyleFlagState(flag, elements, appState, app),
          }))}
          value={null}
          onClick={(flag, event) => {
            // keep the editor's focus (and selection)
            event.preventDefault();
            updateData(flag);
          }}
        />
      </div>
    </fieldset>
  );
};

export const actionToggleTextStyle = register<TextStyleFlag>({
  name: "toggleTextStyle",
  label: "labels.textStyle",
  trackEvent: false,
  predicate: (elements, appState, _, app) =>
    canStyleText(elements, appState, app),
  perform: (elements, appState, flag, app) =>
    flag
      ? toggleTextStyleFlag(flag, elements, appState, app)
      : { captureUpdate: CaptureUpdateAction.EVENTUALLY },
  // reads the full app state: the editor's selection is relevant, and the
  // panel re-renders on its changes anyway (see useSelectionChange)
  PanelComponent: ({ elements, updateData, app }) => (
    <TextStylePanel
      elements={elements}
      appState={app.state}
      updateData={updateData}
      app={app}
    />
  ),
});

const registerTextStyleShortcut = (
  name:
    | "toggleTextBold"
    | "toggleTextItalic"
    | "toggleTextUnderline"
    | "toggleTextStrikethrough",
  option: typeof TEXT_STYLE_OPTIONS[number],
) =>
  register({
    name,
    label: `labels.textStyle_${option.flag}`,
    icon: option.icon,
    trackEvent: false,
    predicate: (elements, appState, _, app) =>
      canStyleText(elements, appState, app),
    perform: (elements, appState, _, app) =>
      toggleTextStyleFlag(option.flag, elements, appState, app),
    keyTest: (event, appState, elements, app) =>
      !!event[KEYS.CTRL_OR_CMD] &&
      event.shiftKey === option.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === option.key &&
      canStyleText(elements, appState, app),
  });

export const actionToggleTextBold = registerTextStyleShortcut(
  "toggleTextBold",
  TEXT_STYLE_OPTIONS[0],
);
export const actionToggleTextItalic = registerTextStyleShortcut(
  "toggleTextItalic",
  TEXT_STYLE_OPTIONS[1],
);
export const actionToggleTextUnderline = registerTextStyleShortcut(
  "toggleTextUnderline",
  TEXT_STYLE_OPTIONS[2],
);
export const actionToggleTextStrikethrough = registerTextStyleShortcut(
  "toggleTextStrikethrough",
  TEXT_STYLE_OPTIONS[3],
);

export const TEXT_STYLE_SHORTCUT_ACTIONS = [
  actionToggleTextBold,
  actionToggleTextItalic,
  actionToggleTextUnderline,
  actionToggleTextStrikethrough,
];
