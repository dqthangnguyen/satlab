// Navigation rules for the question workspace. Pure, so they can be tested without a browser.
export interface NavItem { answered: boolean; flagged: boolean }
export const clampIndex = (i: number, total: number) => Math.min(Math.max(0, Math.trunc(i) || 0), Math.max(0, total - 1));
export const canPrev = (i: number) => i > 0;
export const canNext = (i: number, total: number) => i < total - 1;
/** Where to start: the first question without a recorded answer, or the first question when all are answered. */
export const firstUnanswered = (ids: string[], answered: Set<string>) => Math.max(0, ids.findIndex((id) => !answered.has(id)));
export const navItems = (ids: string[], isAnswered: (id: string) => boolean, flags: Record<string, boolean>): NavItem[] =>
  ids.map((id) => ({ answered: isAnswered(id), flagged: !!flags[id] }));
export const countUnanswered = (items: NavItem[]) => items.filter((x) => !x.answered).length;
