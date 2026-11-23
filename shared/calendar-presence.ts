import type { CalendarEvent } from './api.interface';
export const classifyPresence = (events: CalendarEvent[], now: number) => {
  const rank = { onWay: 1, early: 2, away: 3 },
    people = new Map<string, { id: string; kind: keyof typeof rank; event: CalendarEvent }>();
  let nextTransition = Infinity;
  for (const e of events) {
    if (e.start > now) nextTransition = Math.min(nextTransition, e.start);
    if (e.end > now) nextTransition = Math.min(nextTransition, e.end);
    if (e.start > now || e.end <= now) continue;
    const kind =
      e.type === '晚到' || e.type === '迟到'
        ? 'onWay'
        : e.type === '提前离开' || e.type === '早退'
          ? 'early'
          : 'away';
    for (const id of e.userIds) {
      const previous = people.get(id);
      if (!previous || rank[kind] > rank[previous.kind]) people.set(id, { id, kind, event: e });
    }
  }
  const counts = { onWay: 0, away: 0, early: 0 };
  for (const p of people.values()) counts[p.kind]++;
  return { people: [...people.values()], counts, nextTransition };
};
