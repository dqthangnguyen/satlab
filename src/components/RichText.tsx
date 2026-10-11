import { useMemo } from 'react';
import katex from 'katex';
import { overlaps, parseRichText, splitByRanges } from '../lib/richText';
import type { Span } from '../lib/richText';

// Only KaTeX's own output is ever injected as HTML. Imported text is always rendered as escaped React text.
function Formula({ tex, display, start, end, hl, field }: { tex: string; display: boolean; start: number; end: number; hl: boolean; field?: string }) {
  const html = useMemo(() => {
    try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' }); } catch { return null; }
  }, [tex, display]);
  const cls = `${display ? 'my-2 block overflow-x-auto' : 'inline-block'}${hl ? ' hl' : ''}`;
  const attrs = { 'data-s': start, 'data-e': end, 'data-atom': '', 'data-hl': hl ? field : undefined, className: cls };
  return html === null ? <span {...attrs}>{tex}</span> : <span {...attrs} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function RichText({ text, ranges = [], field }: { text: string; ranges?: Span[]; field?: string }) {
  const segs = useMemo(() => parseRichText(text), [text]);
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === 'math') return <Formula key={i} tex={s.tex} display={s.display} start={s.start} end={s.end} hl={overlaps(ranges, s.start, s.end)} field={field} />;
        if (s.kind === 'lit') { const hl = overlaps(ranges, s.start, s.end); return <span key={i} data-s={s.start} data-e={s.end} data-atom="" data-hl={hl ? field : undefined} className={hl ? 'hl' : undefined}>{s.text}</span>; }
        const inner = splitByRanges(s.text, s.start, ranges).map((p) => p.hl
          ? <mark key={p.start} className="hl" data-s={p.start} data-hl={field}>{p.text}</mark>
          : <span key={p.start} data-s={p.start}>{p.text}</span>);
        return s.kind === 'em' ? <em key={i}>{inner}</em> : s.kind === 'strong' ? <strong key={i}>{inner}</strong> : s.kind === 'sup' ? <sup key={i}>{inner}</sup> : s.kind === 'sub' ? <sub key={i}>{inner}</sub> : <span key={i}>{inner}</span>;
      })}
    </>
  );
}
