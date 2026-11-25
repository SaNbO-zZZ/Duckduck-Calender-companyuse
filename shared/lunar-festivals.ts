// Beijing civil dates from Hong Kong Observatory's Gregorian–Lunar conversion tables.
// https://www.hko.gov.hk/en/gts/time/conversion.htm
const terms = '小寒 大寒 立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至'.split(' ');
const termDays: Record<number, number[]> = {
  2025: [5, 20, 3, 18, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
  2026: [5, 20, 4, 18, 5, 20, 5, 20, 5, 21, 5, 21, 7, 23, 7, 23, 7, 23, 8, 23, 7, 22, 7, 22],
  2027: [5, 20, 4, 19, 6, 21, 5, 20, 6, 21, 6, 21, 7, 23, 8, 23, 8, 23, 8, 23, 7, 22, 7, 22],
  2028: [6, 20, 4, 19, 5, 20, 4, 19, 5, 20, 5, 21, 6, 22, 7, 22, 7, 22, 8, 23, 7, 22, 6, 21],
  2029: [5, 20, 3, 18, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
  2030: [5, 20, 4, 18, 5, 20, 5, 20, 5, 21, 5, 21, 7, 23, 7, 23, 7, 23, 8, 23, 7, 22, 7, 22],
  2031: [5, 20, 4, 19, 6, 21, 5, 20, 6, 21, 6, 21, 7, 23, 8, 23, 8, 23, 8, 23, 7, 22, 7, 22],
  2032: [6, 20, 4, 19, 5, 20, 4, 19, 5, 20, 5, 21, 6, 22, 7, 22, 7, 22, 8, 23, 7, 22, 6, 21],
  2033: [5, 20, 3, 18, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
  2034: [5, 20, 4, 18, 5, 20, 5, 20, 5, 21, 5, 21, 7, 23, 7, 23, 7, 23, 8, 23, 7, 22, 7, 22],
  2035: [5, 20, 4, 19, 6, 21, 5, 20, 5, 21, 6, 21, 7, 23, 7, 23, 8, 23, 8, 23, 7, 22, 7, 22],
};
const chinese = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric',
});
// Signed month lengths, with negative entries denoting the repeated leap month.
// The first and last rows cover the partial lunar years at the range boundaries.
const lunarYears: Array<[string, number, number[]]> = [
  ['2024-12-31', 12, [29]],
  ['2025-01-29', 1, [30, 29, 30, 29, 29, 30, -29, 30, 29, 30, 30, 30, 29]],
  ['2026-02-17', 1, [30, 29, 30, 29, 29, 30, 29, 29, 30, 30, 30, 29]],
  ['2027-02-06', 1, [30, 30, 29, 30, 29, 29, 30, 29, 29, 30, 30, 29]],
  ['2028-01-26', 1, [30, 30, 30, 29, 30, -29, 29, 30, 29, 29, 30, 30, 29]],
  ['2029-02-13', 1, [30, 30, 29, 30, 29, 30, 29, 30, 29, 29, 30, 30]],
  ['2030-02-03', 1, [29, 30, 29, 30, 30, 29, 30, 29, 30, 29, 30, 29]],
  ['2031-01-23', 1, [29, 30, 30, -29, 30, 29, 30, 30, 29, 30, 29, 30, 29]],
  ['2032-02-11', 1, [30, 29, 29, 30, 29, 30, 30, 29, 30, 30, 29, 30]],
  ['2033-01-31', 1, [29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 30, -29, 30]],
  ['2034-02-19', 1, [29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 29, 30]],
  ['2035-02-08', 1, [30, 29, 30, 29, 29, 30, 29, 29, 30, 30, 29, 3]],
];
const monthNames = '正月 二月 三月 四月 五月 六月 七月 八月 九月 十月 冬月 腊月'.split(' ');
function lunarParts(date: string, instant: Date) {
  if (date >= '2025-01-01' && date <= '2035-12-31') {
    for (let i = lunarYears.length - 1; i >= 0; i--) {
      const [start, firstMonth, lengths] = lunarYears[i];
      if (date < start) continue;
      let offset = (Date.parse(date) - Date.parse(start)) / 86400000;
      let month = firstMonth - 1;
      for (const length of lengths) {
        if (length > 0) month++;
        if (offset < Math.abs(length)) return {
          lunarMonth: (length < 0 ? '闰' : '') + monthNames[month - 1], n: offset + 1,
        };
        offset -= Math.abs(length);
      }
    }
  }
  const parts = chinese.formatToParts(instant);
  return {
    lunarMonth: parts.find((p) => p.type === 'month')!.value,
    n: Number(parts.find((p) => p.type === 'day')!.value),
  };
}
const numbers = '一二三四五六七八九十';
const lunarFeasts: Record<string, string> = {
  '正月1': '春节', '正月15': '元宵节', '五月5': '端午节', '七月7': '七夕',
  '八月15': '中秋节', '九月9': '重阳节', '腊月8': '腊八节',
};
const fixed: Record<string, string> = {
  '01-01': '元旦', '02-14': '情人节', '05-01': '劳动节', '10-01': '国庆节',
  '10-31': '万圣节', '12-25': '圣诞节',
};

// Gregorian computus (Meeus/Jones/Butcher).
function easterDay(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const n = h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114;
  return [Math.floor(n / 31), n % 31 + 1];
}

export function calendarLabels(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const instant = new Date(date + 'T12:00:00+08:00');
  const { lunarMonth, n } = lunarParts(date, instant);
  const tens = n <= 10 ? '初' : n <= 19 ? '十' : n <= 29 ? '廿' : '三';
  const lunar = n === 1 ? lunarMonth : n === 20 ? '二十' : tens + numbers[(n - 1) % 10];
  const index = (month - 1) * 2;
  const days = termDays[year];
  const term = days?.[index] === day ? terms[index] : days?.[index + 1] === day ? terms[index + 1] : '';
  const [em, ed] = easterDay(year);
  const movable = month === em && day === ed ? '复活节'
    : month === 11 && day >= 22 && day <= 28 && instant.getUTCDay() === 4 ? '感恩节' : '';
  const tomorrow = new Date(instant.getTime() + 86400000);
  const eve = lunarMonth === '腊月' && n >= 29 &&
    lunarParts(tomorrow.toISOString().slice(0, 10), tomorrow).lunarMonth === '正月';
  const festival = (eve ? '除夕' : lunarFeasts[lunarMonth + n]) || fixed[date.slice(5)] || movable || (term === '清明' ? '清明节' : '');
  return { lunar, term, festival };
}
