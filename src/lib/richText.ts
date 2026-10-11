// Parses the small markup set found in imported questions into safe segments. Nothing here produces HTML.
export type Span = [number, number]; // [start, end) offsets into the ORIGINAL question string
export type Segment =
  | { kind: 'text' | 'em' | 'strong' | 'sup' | 'sub'; text: string; start: number } // visible text === source.slice(start, start + text.length)
  | { kind: 'math'; tex: string; display: boolean; start: number; end: number }
  | { kind: 'lit'; text: string; start: number; end: number }; // an escaped character such as \$

const RE = /\\\$|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\.|[^$\\])+?)\$|<sup>([^<]*)<\/sup>|<sub>([^<]*)<\/sub>|\*([^*\s](?:[^*]*[^*\s])?)\*|_([^\s_](?:[^_]*[^\s_])?)_|\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g;
const WORD = /[A-Za-z0-9]/;

export function parseRichText(src: string): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  const pushText = (to: number) => { if (to > cursor) out.push({ kind: 'text', text: src.slice(cursor, to), start: cursor }); };
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(src))) {
    const s = m.index, e = s + m[0].length;
    let seg: Segment | null = null;
    const edge = !WORD.test(src[s - 1] ?? '') && !WORD.test(src[e] ?? ''); // markdown emphasis must not sit inside a word
    if (m[0] === '\\$') seg = { kind: 'lit', text: '$', start: s, end: e };
    else if (m[1] !== undefined) seg = { kind: 'math', tex: m[1], display: true, start: s, end: e };
    else if (m[2] !== undefined) seg = { kind: 'math', tex: m[2], display: true, start: s, end: e };
    else if (m[3] !== undefined) seg = { kind: 'math', tex: m[3], display: false, start: s, end: e };
    else if (m[4] !== undefined) { // "$" is math only if it looks like math, so "$1.20 per pound ... $0.80" stays text
      const t = m[4];
      if (!/\s/.test(t[0]) && !/\s/.test(t[t.length - 1]) && !/\d/.test(src[e] ?? '')) seg = { kind: 'math', tex: t, display: false, start: s, end: e };
    }
    else if (m[5] !== undefined) seg = { kind: 'sup', text: m[5], start: s + 5 };
    else if (m[6] !== undefined) seg = { kind: 'sub', text: m[6], start: s + 5 };
    else if (m[7] !== undefined) { if (edge) seg = { kind: 'em', text: m[7], start: s + 1 }; }
    else if (m[8] !== undefined) { if (edge) seg = { kind: 'em', text: m[8], start: s + 1 }; }
    else if (m[9] !== undefined) seg = { kind: 'strong', text: m[9], start: s + 2 };
    if (!seg) { RE.lastIndex = s + 1; continue; }
    pushText(s);
    out.push(seg);
    cursor = e;
  }
  pushText(src.length);
  return out;
}

export interface Piece { text: string; start: number; hl: boolean }
/** Splits visible text into highlighted and plain pieces. `ranges` must be sorted and merged. */
export function splitByRanges(text: string, start: number, ranges: Span[]): Piece[] {
  const end = start + text.length, pieces: Piece[] = [];
  let pos = start;
  for (const [a, b] of ranges) {
    if (b <= pos || a >= end) continue;
    const s = Math.max(a, pos), e = Math.min(b, end);
    if (s > pos) pieces.push({ text: text.slice(pos - start, s - start), start: pos, hl: false });
    pieces.push({ text: text.slice(s - start, e - start), start: s, hl: true });
    pos = e;
  }
  if (pos < end) pieces.push({ text: text.slice(pos - start), start: pos, hl: false });
  return pieces;
}
export const overlaps = (ranges: Span[], a: number, b: number) => ranges.some(([x, y]) => a < y && b > x);
