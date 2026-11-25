const rainScenes = [
  'clear',
  'lightRain',
  'heavyRain',
  'heavyRain',
  'storm',
  'storm',
];
const snowScenes = [
  'clear',
  'lightSnow',
  'snow',
  'heavySnow',
  'heavySnow',
  'heavySnow',
];

export function conditions(info: string, rain: number) {
  const snow = info.includes('雪');
  const wet =
    snow ||
    info.includes('雨') ||
    (rain > 0 && rain < 1000 && !info.includes('晴'));
  const precipType = !wet ? 'none' : snow ? 'snow' : 'rain';
  let precipLevel = 0;
  if (wet) {
    if (/特大暴|大暴[雨雪]/.test(info)) precipLevel = 5;
    else if (/暴[雨雪]/.test(info)) precipLevel = 4;
    else if (/大[雨雪]/.test(info)) precipLevel = 3;
    else if (/中[雨雪]|雷阵雨/.test(info)) precipLevel = 2;
    else precipLevel = 1;
  }
  let scene = 'overcast',
    description = '阴',
    cloud = 0.92;
  if (wet) {
    scene = (snow ? snowScenes : rainScenes)[precipLevel];
    cloud = 0.85 + (0.15 * (precipLevel - 1)) / 4;
    description =
      ['', '小', '中', '大', '暴', '特大暴'][precipLevel] +
      (snow ? '雪' : '雨');
  } else if (/多云|少云/.test(info)) {
    scene = 'partly';
    description = '多云';
    cloud = 0.48;
  } else if (/晴/.test(info)) {
    scene = 'clear';
    description = '晴';
    cloud = 0.1;
  }
  if (/[\u3400-\u9fff]/.test(info)) description = info;
  else if (!wet) {
    scene = 'clear';
    description = '暖晴';
    cloud = 0.12;
  }
  return {
    scene,
    description,
    cloud,
    cloudCover: cloud,
    precipType,
    precipLevel,
  } as const;
}
