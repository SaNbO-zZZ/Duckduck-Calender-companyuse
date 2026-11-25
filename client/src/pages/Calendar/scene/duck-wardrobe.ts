import type { WeatherData } from '../../../../../shared/api.interface';

export const outfits = {
  shades: '墨镜日光浴',
  straw: '花园草帽',
  lemonade: '柠檬汽水',
  fishing: '池边垂钓',
  coffee: '咖啡时光',
  book: '读书日',
  camera: '小小摄影师',
  umbrella: '柠黄雨伞',
  slicker: '薄荷雨衣',
  leaf: '荷叶听雨',
  beret: '迎风贝雷帽',
  scarf: '风中长围巾',
  aviator: '飞行风镜',
  beanie: '针织毛线帽',
  snowman: '雪人伙伴',
  cocoa: '热可可',
  nightcap: '晚安睡帽',
  telescope: '星空望远镜',
  lantern: '提灯看月亮',
  pumpkin: '南瓜小帽',
  wave: '向你挥挥翅膀',
  gaze: '仰望云朵',
  warmer: '抱紧暖手宝',
  brace: '迎风小步走',
  catchSnow: '接住一朵雪花',
};
export type Outfit = keyof typeof outfits;
const windLooks: Outfit[] = ['beret', 'scarf', 'aviator', 'brace'];
export function wardrobe(
  weather: WeatherData | undefined,
  phase: string,
  halloween: boolean,
): Outfit[] {
  const wet = weather?.precipType;
  const pool: Outfit[] =
    wet === 'rain'
      ? ['umbrella', 'slicker', 'leaf', 'warmer']
      : wet === 'snow'
        ? ['beanie', 'snowman', 'cocoa', 'catchSnow']
        : phase === 'night'
          ? ['nightcap', 'telescope', 'lantern']
          : (weather?.cloudCover ?? 0) > 0.4
            ? ['book', 'camera', 'coffee', 'gaze']
            : ['shades', 'straw', 'lemonade', 'fishing', 'wave'];
  if ((weather?.windLevel ?? 0) >= 2) pool.push(...windLooks);
  if (wet !== 'none' && phase === 'night' && !pool.includes('lantern'))
    pool.push('lantern');
  if (halloween) pool.push('pumpkin');
  return pool;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function chooseFlock(pool: Outfit[]): Outfit[] {
  const shuffled = shuffle(pool);
  const wind = shuffled.find((look) => windLooks.includes(look));
  const special = pool.includes('pumpkin')
    ? 'pumpkin'
    : pool.includes('lantern') && !pool.includes('nightcap')
      ? 'lantern'
      : undefined;
  const weather = shuffled.find(
    (look) => !windLooks.includes(look) && look !== special,
  )!;
  const chosen = new Set<Outfit>([weather]);
  if (wind) chosen.add(wind);
  if (special) chosen.add(special);
  for (const look of shuffled) {
    if (chosen.size === 3) break;
    chosen.add(look);
  }
  return shuffle([...chosen]);
}
