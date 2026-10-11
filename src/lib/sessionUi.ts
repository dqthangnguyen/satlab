// Unsaved screen state of a practice session (selected-but-unchecked answers, flags, position).
// Kept in its own localStorage key; recorded answers still live in the main store ("satlab:v2").
export interface SessionUi { cursor: number; drafts: Record<string, string>; flags: Record<string, boolean>; skipped: Record<string, boolean> }
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const SESSION_UI_KEY = 'satlab:session-ui:v1';
const KEEP = 30; // newest sessions kept

const readAll = (s: StorageLike): Record<string, Record<string, unknown>> => {
  try { const d = JSON.parse(s.getItem(SESSION_UI_KEY) ?? '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
};
const boolMap = (v: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (x === true) out[k] = true;
  return out;
};
export function loadSessionUi(s: StorageLike, sid: string): SessionUi | null {
  const e = readAll(s)[sid];
  if (!e) return null;
  const drafts: Record<string, string> = {};
  if (e.drafts && typeof e.drafts === 'object') for (const [k, v] of Object.entries(e.drafts)) if (typeof v === 'string') drafts[k] = v;
  return { cursor: typeof e.cursor === 'number' && Number.isFinite(e.cursor) ? e.cursor : 0, drafts, flags: boolMap(e.flags), skipped: boolMap(e.skipped) };
}
export function saveSessionUi(s: StorageLike, sid: string, ui: SessionUi, now = Date.now()): void {
  try {
    const all = readAll(s);
    all[sid] = { ...ui, at: now };
    const keep = Object.entries(all).sort((a, b) => Number(b[1].at ?? 0) - Number(a[1].at ?? 0)).slice(0, KEEP);
    s.setItem(SESSION_UI_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* storage full or blocked: the screen state just will not survive a refresh */ }
}
