import { z } from 'zod';
import { beijingDate, parseBeijingDate } from '../shared/duty-calendar.js';
import type { CalendarPerson, CalendarEvent, CalendarData } from '../shared/api.interface.js';
import { db, MissingColumnError } from './feishu-auth.js';
import { input, query } from './business-http.js';
import { Feishu, openId, tables } from './feishu-platform.js';

const DAY = 86400000;
const personField = z.array(
  z.object({ id: openId, name: z.string().optional(), avatar_url: z.string().optional() }),
);
const textField = z.union([
  z.string(),
  z.array(z.object({ text: z.string() })).transform((parts) => parts.map((part) => part.text).join('')),
]);
function bounds(month: string | null) {
  const value = input(z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), month);
  const start = parseBeijingDate(value + '-01');
  const end = Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5)), 1) - 8 * 3600000;
  return { start, end };
}
function dateCondition(field_name: string, operator: string, ms: number) {
  return { field_name, operator, value: ['ExactDate', String(ms)] };
}
export async function holidays(api: Feishu, month: string | null) {
  const { start, end } = bounds(month);
  const rows = await api.search(
    tables.holiday,
    ['日期', '节日名', '类型'],
    [dateCondition('日期', 'isGreater', start - DAY), dateCondition('日期', 'isLess', end + DAY)],
  );
  return rows
    .filter((r) => Number(r.fields['日期']) >= start && Number(r.fields['日期']) < end)
    .map(({ fields }) => ({
      date: beijingDate(z.number().parse(fields['日期'])),
      name: textField.parse(fields['节日名']),
      type: z.string().parse(fields['类型']),
    }));
}
async function events(api: Feishu, start: number, end: number, people: Map<string, CalendarPerson>) {
  const output: CalendarEvent[] = [];
  for (const [table, typeField] of [
    [tables.leave, '类型'],
    [tables.attendance, '登记类型'],
  ]) {
    const rows = await api.search(
      table,
      ['申请人', typeField, '开始时间', '结束时间'],
      [
        { field_name: '状态', operator: 'is', value: ['已登记'] },
        dateCondition('开始时间', 'isLess', end + DAY),
        dateCondition('结束时间', 'isGreater', start - DAY),
      ],
    );
    for (const { record_id, fields } of rows) {
      const from = z.number().parse(fields['开始时间']),
        until = z.number().parse(fields['结束时间']);
      if (from >= end || until <= start) continue;
      const persons = personField.parse(fields['申请人'] ?? []);
      for (const person of persons)
        people.set(person.id, {
          id: person.id,
          name: person.name || '账号暂不可用',
          avatar: person.avatar_url,
        });
      const label = z.string().parse(fields[typeField]);
      output.push({
        id: record_id,
        type: label === '早退' ? '提前离开' : label === '迟到' ? '晚到' : label,
        userIds: persons.map((person) => person.id),
        start: from,
        end: until,
      });
    }
  }
  return output;
}
async function monthBirthdays(month: string): Promise<CalendarData['birthdays']> {
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const members = await db<Array<{open_id: string; name: string | null; avatar_url: string | null; birth_day: number}>>(
    query('feishu_users', {
      select: 'open_id,name,avatar_url,birth_day',
      is_active: 'eq.true', birth_month: 'eq.' + number, birth_day: 'not.is.null',
      order: 'birth_day.asc,open_id.asc',
    }),
  ).catch((error: unknown) => {
    if (error instanceof MissingColumnError &&
      ['feishu_users.birth_month', 'feishu_users.birth_day'].includes(error.column)) return [];
    throw error;
  });
  return members.map((member) => ({
    date: month + '-' + String(Math.min(lastDay, member.birth_day)).padStart(2, '0'),
    userId: member.open_id, name: member.name || '团队成员', avatar: member.avatar_url ?? undefined,
  }));
}
export async function monthData(
  api: Feishu,
  month: string | null,
  now = Date.now(),
): Promise<CalendarData> {
  const { start, end } = bounds(month);
  const today = parseBeijingDate(beijingDate(now)),
    people = new Map<string, CalendarPerson>();
  const [monthly, days, birthdays] = await Promise.all([
    events(api, start, end, people), holidays(api, month), monthBirthdays(beijingDate(start).slice(0, 7)),
  ]);
  const current =
    today >= start && today < end
      ? monthly.filter((e) => e.start < today + DAY && e.end > today)
      : await events(api, today, today + DAY, people);
  return {
    birthdays,
    events: monthly,
    todayEvents: current,
    activeEvents: current.filter((e) => e.start <= now && e.end > now),
    todayUserIds: [...new Set(current.flatMap((e) => e.userIds))],
    people: [...people.values()],
    holidays: days,
    serverTime: now,
  };
}
