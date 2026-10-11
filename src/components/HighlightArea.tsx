import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FIELDS, addRange, emptyHighlights, highlightKey, isEmpty, loadHighlights, normalize, removeRange, saveHighlights } from '../lib/highlights';
import type { Field, FieldHighlights, StorageLike } from '../lib/highlights';

const memory: StorageLike = { getItem: () => null, setItem: () => {} };
const getStorage = (): StorageLike => { try { return window.localStorage; } catch { return memory; } };

/** Maps a DOM selection to offsets in the original question text. Formulas are atomic: touching one selects all of it. */
export function coverFromSelection(root: HTMLElement, r: Range): FieldHighlights {
  const out = emptyHighlights();
  root.querySelectorAll<HTMLElement>('[data-field] [data-s]').forEach((el) => {
    if (!r.intersectsNode(el)) return;
    const field = el.closest<HTMLElement>('[data-field]')!.dataset.field as Field;
    const s = Number(el.dataset.s);
    if (el.hasAttribute('data-atom')) { out[field].push([s, Number(el.dataset.e)]); return; }
    const t = el.firstChild;
    if (!t || t.nodeType !== 3) return;
    const len = (t as Text).length;
    let a = 0, b = len;
    if (r.startContainer === t) a = r.startOffset; else if (r.startContainer === el) a = r.startOffset > 0 ? len : 0;
    if (r.endContainer === t) b = r.endOffset; else if (r.endContainer === el) b = r.endOffset > 0 ? len : 0;
    if (b > a) out[field].push([s + a, s + b]);
  });
  for (const f of FIELDS) out[f] = normalize(out[f]);
  return out;
}
const touches = (h: FieldHighlights, c: FieldHighlights) => FIELDS.some((f) => c[f].some(([a, b]) => h[f].some(([x, y]) => a < y && b > x)));

/** Toolbar position for a rectangle, kept inside the viewport (the selection may be partly scrolled out of view). */
function place(rect: DOMRect) {
  const below = rect.top < 64;
  const y = below ? rect.bottom + 8 : rect.top - 8;
  return { x: Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90), y: Math.min(Math.max(y, 56), window.innerHeight - 56), below };
}

interface Bar { x: number; y: number; below: boolean; cover: FieldHighlights; canAdd: boolean; canRemove: boolean; fromClick?: boolean }

export default function HighlightArea({ id, version, children }: { id: string; version: number; children: (h: FieldHighlights) => ReactNode }) {
  const key = highlightKey(id, version);
  const root = useRef<HTMLDivElement>(null);
  const [hl, setHl] = useState<FieldHighlights>(() => loadHighlights(getStorage(), key));
  const [bar, setBar] = useState<Bar | null>(null);
  const hlRef = useRef(hl);
  hlRef.current = hl;
  useEffect(() => { setHl(loadHighlights(getStorage(), key)); setBar(null); }, [key]);

  const commit = (next: FieldHighlights) => { setHl(next); saveHighlights(getStorage(), key, next); };
  const apply = (cover: FieldHighlights, add: boolean) => {
    const next = emptyHighlights();
    for (const f of FIELDS) { let cur = hlRef.current[f]; for (const s of cover[f]) cur = add ? addRange(cur, s) : removeRange(cur, s); next[f] = cur; }
    commit(next); setBar(null); window.getSelection()?.removeAllRanges();
  };
  const read = (): Bar | null => {
    const sel = window.getSelection(), el = root.current;
    if (!sel || !el || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return null;
    const r = sel.getRangeAt(0), cover = coverFromSelection(el, r);
    if (!FIELDS.some((f) => cover[f].length)) return null;
    return { ...place(r.getBoundingClientRect()), cover, canAdd: true, canRemove: touches(hlRef.current, cover) };
  };
  useEffect(() => {
    // A bar opened by clicking a highlight has no text selection, so a (delayed) selectionchange must not close it.
    const onSel = () => { const b = read(); setBar((prev) => b ?? (prev?.fromClick ? prev : null)); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('[role=toolbar]') && !t?.closest?.('[data-hl]')) setBar((prev) => (prev?.fromClick ? null : prev));
    };
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('selectionchange', onSel); document.removeEventListener('mousedown', onDown); };
  }, []);

  const btn = 'rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-900';
  return (
    <div>
      {!isEmpty(hl) && <div className="mb-2 flex justify-end"><button type="button" className="text-sm font-semibold text-brand-700 underline" onClick={() => { commit(emptyHighlights()); setBar(null); }}>Clear highlights</button></div>}
      <div ref={root} tabIndex={0} role="group" aria-label="Question text. Select text, then press Alt+Shift+H to highlight or Alt+Shift+U to remove a highlight."
        onKeyDown={(e) => { if (e.key === 'Escape') setBar(null); if (e.altKey && e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyU')) { const b = read(); if (b) { e.preventDefault(); apply(b.cover, e.code === 'KeyH'); } } }}
        onClick={(e) => {
          const m = (e.target as HTMLElement).closest<HTMLElement>('[data-hl]');
          if (!m || !window.getSelection()?.isCollapsed) return;
          const f = m.dataset.hl as Field, s = Number(m.dataset.s), span = hlRef.current[f]?.find(([a, b]) => a <= s && s < b);
          if (!span) return;
          const cover = emptyHighlights(); cover[f] = [span];
          setBar({ ...place(m.getBoundingClientRect()), cover, canAdd: false, canRemove: true, fromClick: true });
        }}>
        {children(hl)}
      </div>
      {bar && (
        <div role="toolbar" aria-label="Highlight" className="flex gap-1 rounded-xl bg-slate-900 p-1 shadow-lg"
          style={{ position: 'fixed', left: bar.x, top: bar.y, transform: `translate(-50%, ${bar.below ? '0' : '-100%'})`, zIndex: 50 }}>
          {bar.canAdd && <button type="button" className={`${btn} bg-sun-300`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(bar.cover, true)}>Highlight</button>}
          {bar.canRemove && <button type="button" className={`${btn} bg-white`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(bar.cover, false)}>Remove</button>}
        </div>
      )}
    </div>
  );
}
