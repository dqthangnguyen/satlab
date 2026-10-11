import type { Span } from './richText';

export type Field = 'passage' | 'prompt';
export const FIELDS: Field[] = ['passage', 'prompt'];
export type FieldHighlights = Record<Field, Span[]>;
export const emptyHighlights = (): FieldHighlights => ({ passage: [], prompt: [] });
export const isEmpty = (h: FieldHighlights) => FIELDS.every((f) => h[f].length === 0);

/** Sorts, merges overlapping or touching spans and drops invalid ones. */
export function normalize(spans: Span[]): Span[] {
  const sorted = spans.filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b > a).map((s) => [s[0], s[1]] as Span).sort((x, y) => x[0] - y[0]);
  const out: Span[] = [];
  for (const s of sorted) { const last = out[out.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else out.push(s); }
  return out;
}
export const addRange = (spans: Span[], s: Span) => normalize([...spans, s]);
export function removeRange(spans: Span[], r: Span): Span[] {
  const out: Span[] = [];
  for (const [a, b] of normalize(spans)) {
    if (r[1] <= a || r[0] >= b) { out.push([a, b]); continue; }
    if (a < r[0]) out.push([a, r[0]]);
    if (r[1] < b) out.push([r[1], b]);
  }
  return normalize(out);
}

// Stored in its own key so the main progress data ("satlab:v2") is never touched.
// Scoped by question id and version: if a question's text is revised, old offsets are not reused.
export const STORAGE_KEY = 'satlab:highlights:v1';
export const highlightKey = (id: string, version: number) => `${id}@${version}`;
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

function readAll(storage: StorageLike): Record<string, unknown> {
  try { const data = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
}
export function loadHighlights(storage: StorageLike, key: string): FieldHighlights {
  const h = emptyHighlights(), entry = readAll(storage)[key];
  if (entry && typeof entry === 'object') for (const f of FIELDS) { const v = (entry as Record<string, unknown>)[f]; if (Array.isArray(v)) h[f] = normalize(v.filter((r) => Array.isArray(r) && r.length === 2) as Span[]); }
  return h;
}
export function saveHighlights(storage: StorageLike, key: string, h: FieldHighlights): void {
  try {
    const all = readAll(storage);
    if (isEmpty(h)) delete all[key]; else all[key] = h;
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked: highlights just will not persist */ }
}
