import type {
  ExcalidrawTextElement,
  TextStyleAttributes,
  TextStyleRange,
} from "./types";

/**
 * Inline (per character range) text styles.
 *
 * Ranges are end-exclusive code-unit offsets into `originalText`, sorted,
 * non-overlapping, non-empty, and adjacent ranges with equal styles are
 * merged. None of the styles change a glyph's advance width (see
 * `renderStyledTextLine`), so the text's layout (wrapping, measuring, the
 * editor's caret) is the same as the plain text's.
 */

export const TEXT_STYLE_FLAGS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
] as const;

export type TextStyleFlag = typeof TEXT_STYLE_FLAGS[number];

/** a style update: `false` / `null` remove the attribute */
export type TextStyleUpdate = {
  [K in TextStyleFlag]?: boolean;
} & {
  strokeColor?: string | null;
};

type CharStyle = TextStyleAttributes | null;

const isEmptyStyle = (style: TextStyleAttributes) => {
  for (const key in style) {
    if (style[key as keyof TextStyleAttributes] !== undefined) {
      return false;
    }
  }
  return true;
};

export const isSameTextStyle = (a: CharStyle, b: CharStyle) => {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strikethrough === !!b.strikethrough &&
    a.strokeColor === b.strokeColor
  );
};

const sanitizeStyle = (style: Record<string, unknown>): CharStyle => {
  const next: { -readonly [K in keyof TextStyleAttributes]: any } = {};
  for (const flag of TEXT_STYLE_FLAGS) {
    if (style[flag] === true) {
      next[flag] = true;
    }
  }
  if (typeof style.strokeColor === "string" && style.strokeColor) {
    next.strokeColor = style.strokeColor;
  }
  return isEmptyStyle(next) ? null : next;
};

/** one entry per code unit of the text */
const toCharStyles = (
  ranges: readonly TextStyleRange[] | null | undefined,
  length: number,
): CharStyle[] => {
  const chars: CharStyle[] = new Array(length).fill(null);
  for (const range of ranges ?? []) {
    const style = sanitizeStyle(range);
    if (!style) {
      continue;
    }
    const end = Math.min(length, range.end);
    for (let index = Math.max(0, range.start); index < end; index++) {
      chars[index] = style;
    }
  }
  return chars;
};

const fromCharStyles = (chars: readonly CharStyle[]) => {
  const ranges: TextStyleRange[] = [];
  let current: { start: number; style: TextStyleAttributes } | null = null;

  for (let index = 0; index <= chars.length; index++) {
    const style = index < chars.length ? chars[index] : null;
    if (current && isSameTextStyle(current.style, style)) {
      continue;
    }
    if (current) {
      ranges.push({ ...current.style, start: current.start, end: index });
    }
    current = style ? { start: index, style } : null;
  }

  return ranges.length ? ranges : null;
};

/**
 * Brings untrusted ranges (restored, pasted, received from a collaborator)
 * into the canonical form for a text of `length`.
 */
export const normalizeTextStyles = (
  ranges: unknown,
  length: number,
): readonly TextStyleRange[] | null => {
  if (!Array.isArray(ranges)) {
    return null;
  }
  const valid = ranges.filter(
    (range): range is TextStyleRange =>
      !!range &&
      typeof range === "object" &&
      Number.isInteger(range.start) &&
      Number.isInteger(range.end) &&
      range.start < range.end,
  );
  // later ranges win where they overlap
  return fromCharStyles(toCharStyles(valid, length));
};

export const getTextStyleAt = (
  ranges: readonly TextStyleRange[] | null | undefined,
  index: number,
): TextStyleAttributes | null => {
  if (!ranges) {
    return null;
  }
  for (const range of ranges) {
    if (index < range.start) {
      return null;
    }
    if (index < range.end) {
      return range;
    }
  }
  return null;
};

const clampSelection = (length: number, start: number, end: number) => {
  const from = Math.max(0, Math.min(start, end, length));
  const to = Math.min(length, Math.max(start, end));
  return [from, to] as const;
};

export const updateTextStyle = (
  style: CharStyle,
  update: TextStyleUpdate,
): CharStyle => {
  // a range is a style too, minus its offsets
  const next: { -readonly [K in keyof TextStyleAttributes]: any } = {
    ...(style && sanitizeStyle(style)),
  };
  for (const flag of TEXT_STYLE_FLAGS) {
    if (update[flag] === true) {
      next[flag] = true;
    } else if (update[flag] === false) {
      delete next[flag];
    }
  }
  if (update.strokeColor === null) {
    delete next.strokeColor;
  } else if (update.strokeColor !== undefined) {
    next.strokeColor = update.strokeColor;
  }
  return isEmptyStyle(next) ? null : next;
};

/** applies `update` to `[start, end)` of a text of `length` */
export const applyTextStyle = (
  ranges: readonly TextStyleRange[] | null | undefined,
  length: number,
  start: number,
  end: number,
  update: TextStyleUpdate,
): readonly TextStyleRange[] | null => {
  const [from, to] = clampSelection(length, start, end);
  const chars = toCharStyles(ranges, length);
  for (let index = from; index < to; index++) {
    chars[index] = updateTextStyle(chars[index], update);
  }
  return fromCharStyles(chars);
};

/**
 * Whether every character of `[start, end)` has `flag` set. An empty range
 * reports the style the next typed character would get.
 */
export const isTextStyleFlagActive = (
  ranges: readonly TextStyleRange[] | null | undefined,
  length: number,
  start: number,
  end: number,
  flag: TextStyleFlag,
) => {
  const [from, to] = clampSelection(length, start, end);
  if (from === to) {
    return !!getInheritedStyle(ranges, from)?.[flag];
  }
  for (let index = from; index < to; index++) {
    if (!getTextStyleAt(ranges, index)?.[flag]) {
      return false;
    }
  }
  return true;
};

/** the color of `[start, end)`, `undefined` when it's mixed */
export const getTextStyleColor = (
  element: Pick<
    ExcalidrawTextElement,
    "textStyles" | "originalText" | "strokeColor"
  >,
  start: number,
  end: number,
) => {
  const [from, to] = clampSelection(element.originalText.length, start, end);
  if (from === to) {
    return (
      getInheritedStyle(element.textStyles, from)?.strokeColor ??
      element.strokeColor
    );
  }
  const color =
    getTextStyleAt(element.textStyles, from)?.strokeColor ??
    element.strokeColor;
  for (let index = from + 1; index < to; index++) {
    if (
      (getTextStyleAt(element.textStyles, index)?.strokeColor ??
        element.strokeColor) !== color
    ) {
      return undefined;
    }
  }
  return color;
};

/** the style a character typed at `index` takes: the one before it */
export const getInheritedStyle = (
  ranges: readonly TextStyleRange[] | null | undefined,
  index: number,
) => getTextStyleAt(ranges, index > 0 ? index - 1 : 0);

/**
 * Carries the ranges over an edit of the text from `prevText` to `nextText`.
 * Characters keep their styles; inserted ones take the style of the
 * character before them, or `insertStyle` when given.
 *
 * `selection` is the editor's selection before the edit, used to tell where
 * the edit happened in runs of repeated characters.
 */
export const getTextStylesAfterEdit = (
  ranges: readonly TextStyleRange[] | null | undefined,
  prevText: string,
  nextText: string,
  {
    selection,
    insertStyle,
  }: {
    selection?: { start: number; end: number } | null;
    insertStyle?: TextStyleAttributes | null;
  } = {},
): readonly TextStyleRange[] | null | undefined => {
  // unchanged as is (`undefined` too), so that an element's update doesn't
  // tell a change where there's none
  if ((!ranges?.length && !insertStyle) || prevText === nextText) {
    return ranges;
  }

  const maxCommon = Math.min(prevText.length, nextText.length);
  let prefix = 0;
  while (prefix < maxCommon && prevText[prefix] === nextText[prefix]) {
    prefix++;
  }
  if (selection) {
    prefix = Math.min(prefix, Math.min(selection.start, selection.end));
  }
  let suffix = 0;
  while (
    suffix < maxCommon - prefix &&
    prevText[prevText.length - 1 - suffix] ===
      nextText[nextText.length - 1 - suffix]
  ) {
    suffix++;
  }
  if (selection) {
    suffix = Math.min(
      suffix,
      prevText.length - Math.max(selection.start, selection.end),
    );
  }

  const prevChars = toCharStyles(ranges, prevText.length);
  const insertedLength = nextText.length - prefix - suffix;
  const inherited =
    insertStyle !== undefined
      ? insertStyle && sanitizeStyle(insertStyle)
      : prevChars[prefix > 0 ? prefix - 1 : prefix] ?? null;

  return fromCharStyles([
    ...prevChars.slice(0, prefix),
    ...new Array(Math.max(0, insertedLength)).fill(inherited),
    ...prevChars.slice(prevText.length - suffix),
  ]);
};

export type StyledTextSegment = {
  text: string;
  /** offset of the segment in the rendered line */
  offset: number;
  style: TextStyleAttributes | null;
};

/**
 * Splits a rendered line, starting at `lineStart` in `originalText`, into
 * runs of equally styled text.
 */
export const getStyledTextSegments = (
  line: string,
  lineStart: number,
  ranges: readonly TextStyleRange[] | null | undefined,
): StyledTextSegment[] => {
  if (!ranges?.length || !line) {
    return [{ text: line, offset: 0, style: null }];
  }
  const segments: StyledTextSegment[] = [];
  let segmentStart = 0;
  let style = getTextStyleAt(ranges, lineStart);
  for (let index = 1; index <= line.length; index++) {
    const nextStyle =
      index < line.length ? getTextStyleAt(ranges, lineStart + index) : null;
    if (index === line.length || !isSameTextStyle(style, nextStyle)) {
      segments.push({
        text: line.slice(segmentStart, index),
        offset: segmentStart,
        style,
      });
      segmentStart = index;
      style = nextStyle;
    }
  }
  return segments;
};

/**
 * Where each line of the (wrapped) `text` starts in `originalText`: wrapping
 * only ever drops whitespace at soft breaks, so each line is found after the
 * previous one. `-1` where a line can't be found (stale `text`).
 */
export const getRenderedLineOffsets = (
  lines: readonly string[],
  originalText: string,
) => {
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    const start = originalText.indexOf(line, cursor);
    offsets.push(start);
    if (start !== -1) {
      cursor = start + line.length;
    }
  }
  return offsets;
};

export const hasTextStyles = (
  element: ExcalidrawTextElement,
): element is ExcalidrawTextElement & {
  textStyles: readonly TextStyleRange[];
} => !!element.textStyles?.length;

/**
 * Bold and italic are synthesized so that they keep the glyphs' advance
 * widths (few of our fonts have bold or italic faces, and the browser's
 * synthesized ones don't keep them either): bold strokes the glyphs' outline
 * as well, italic skews them about the baseline.
 */
export const TEXT_STYLE_METRICS = {
  /** horizontal shift per unit of height above the baseline */
  italicSkew: 0.2,
  /** outline stroke width, relative to the font size */
  boldStrokeWidth: 0.07,
  /** relative to the font size, below the baseline */
  underlineOffset: 0.12,
  /** relative to the font size, above the baseline */
  strikethroughOffset: 0.27,
  /** relative to the font size */
  decorationThickness: 0.06,
};

/** the lines to draw for a style's decorations, relative to the baseline */
export const getTextDecorations = (
  style: TextStyleAttributes | null,
  fontSize: number,
) => {
  const thickness = Math.max(
    1,
    fontSize * TEXT_STYLE_METRICS.decorationThickness,
  );
  const decorations: { y: number; thickness: number }[] = [];
  if (style?.underline) {
    decorations.push({
      y: fontSize * TEXT_STYLE_METRICS.underlineOffset,
      thickness,
    });
  }
  if (style?.strikethrough) {
    decorations.push({
      y: -fontSize * TEXT_STYLE_METRICS.strikethroughOffset,
      thickness,
    });
  }
  return decorations;
};
