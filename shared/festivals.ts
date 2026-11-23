import { addBeijingDays, weekdayOf } from './duty-calendar';

export const festivals = [
  {
    key: 'spring',
    name: '春节',
    color: '#a94137',
    light: '#ffe9d1',
    night: '#4b2429',
    particles: '红包与金箔',
  },
  {
    key: 'dragon',
    name: '端午',
    color: '#39725b',
    light: '#e6f1c8',
    night: '#193e37',
    particles: '竹叶',
  },
  {
    key: 'moon',
    name: '中秋',
    color: '#96621e',
    light: '#ffe6ad',
    night: '#253453',
    particles: '桂花与萤火',
  },
  {
    key: 'halloween',
    name: '万圣节',
    color: '#97511e',
    light: '#ffdfaa',
    night: '#342941',
    particles: '枫叶与蝙蝠',
  },
  {
    key: 'winter',
    name: '圣诞与元旦',
    color: '#356a5b',
    light: '#e4f2e9',
    night: '#233d40',
    particles: '雪花与星光',
  },
] as const;
export type FestivalKey = (typeof festivals)[number]['key'];
const lunar = new Intl.DateTimeFormat('en-u-ca-chinese', {
  timeZone: 'Asia/Shanghai',
  month: 'numeric',
  day: 'numeric',
});
function lunarDate(day: string) {
  const p = lunar.formatToParts(new Date(day + 'T12:00:00+08:00'));
  return p.find((v) => v.type === 'month')?.value + '/' + p.find((v) => v.type === 'day')?.value;
}
export function inFestival(key: FestivalKey, day: string) {
  const md = day.slice(5);
  if (key === 'winter') return md >= '12-22' || md <= '01-03';
  if (key === 'spring')
    return /^1\/([1-9]|1[0-5])$/.test(lunarDate(day)) || lunarDate(addBeijingDays(day, 1)) === '1/1';
  const monday = addBeijingDays(day, 1 - weekdayOf(day));
  return Array.from({ length: 7 }, (_, i) => addBeijingDays(monday, i)).some((d) =>
    key === 'halloween' ? d.endsWith('-10-31') : lunarDate(d) === (key === 'dragon' ? '5/5' : '8/15'),
  );
}
