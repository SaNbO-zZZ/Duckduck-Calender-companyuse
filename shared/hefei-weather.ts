import { z } from 'zod';
import type { WeatherData } from './api.interface';
import { dayInfo } from './hefei-sky';

const rainScenes = ['clear', 'lightRain', 'heavyRain', 'heavyRain', 'storm', 'storm'];
const snowScenes = ['clear', 'lightSnow', 'snow', 'heavySnow', 'heavySnow', 'heavySnow'];

export function conditions(info: string, rain: number) {
  const snow = info.includes('雪');
  const wet = snow || info.includes('雨') || (rain > 0 && rain < 1000 && !info.includes('晴'));
  const precipType = !wet ? 'none' : snow ? 'snow' : 'rain';
  let precipLevel = 0;
  if (wet) {
    if (/特大暴|大暴[雨雪]/.test(info)) precipLevel = 5;
    else if (/暴[雨雪]/.test(info)) precipLevel = 4;
    else if (/大[雨雪]/.test(info)) precipLevel = 3;
    else if (/中[雨雪]|雷阵雨/.test(info)) precipLevel = 2;
    else precipLevel = 1;
  }
  let scene = 'overcast', description = '阴', cloud = 0.92;
  if (wet) {
    scene = (snow ? snowScenes : rainScenes)[precipLevel];
    cloud = 0.85 + 0.15 * (precipLevel - 1) / 4;
    description = ['','小','中','大','暴','特大暴'][precipLevel] + (snow ? '雪' : '雨');
  } else if (/多云|少云/.test(info)) {
    scene = 'partly'; description = '多云'; cloud = 0.48;
  } else if (/晴/.test(info)) {
    scene = 'clear'; description = '晴'; cloud = 0.10;
  }
  if (/[\u3400-\u9fff]/.test(info)) description = info;
  else if (!wet) { scene = 'clear'; description = '暖晴'; cloud = 0.12; }
  return { scene, description, cloud, cloudCover: cloud, precipType, precipLevel } as const;
}

const reading = z.union([z.number(), z.string().trim().min(1).transform(Number)]).optional().nullable();
const observation = z.object({
  code: z.literal(0),
  data: z.object({ real: z.object({
    publish_time: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/),
    station: z.object({ city: z.literal('合肥') }),
    weather: z.object({ info: z.string(), rain: reading, temperature: reading }),
    wind: z.object({ speed: reading, degree: reading }),
  }) }),
});

export async function hefeiWeather(): Promise<WeatherData> {
  const now = Date.now();
  const { rise, set } = dayInfo(now);
  const hhmm = (minutes: number) => new Date(Math.round(minutes) * 60000).toISOString().slice(11, 16);
  const sun = { sunrise: hhmm(rise), sunset: hhmm(set) };
  try {
    const response = await fetch('https://www.nmc.cn/rest/weather?stationid=xqcji', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DuckCalendar/3.0)', Referer: 'https://www.nmc.cn/publish/forecast.html' },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error('weather-source-unavailable');
    const real = observation.parse(await response.json()).data.real;
    const published = Date.parse(real.publish_time.replace(' ', 'T') + '+08:00');
    if (!Number.isFinite(published) || now - published > 90 * 60000 || published - now > 5 * 60000)
      throw new Error('weather-stale');
    const speed = real.wind.speed ?? 0, degree = real.wind.degree ?? 0;
    const windSpeed = speed >= 0 && speed < 100 ? speed * 3.6 : 0;
    const windFrom = degree >= 0 && degree < 360 ? degree : 0;
    const temp = real.weather.temperature;
    const stamp = new Date(published).toISOString();
    const sky = conditions(real.weather.info.trim(), real.weather.rain ?? 0);
    return {
      ...sun, ...sky, available: sky.description !== '暖晴',
      temperature: temp != null && temp >= -60 && temp <= 60 ? temp : null,
      windSpeed, windFrom, windDir: windFrom > 0 && windFrom < 180 ? -1 : 1,
      windLevel: windSpeed >= 50 ? 3 : windSpeed >= 29 ? 2 : windSpeed >= 12 ? 1 : 0,
      validTime: stamp, updatedAt: stamp, source: '合肥天气',
    };
  } catch {
    return { ...sun, available: false, scene: 'clear', description: '暖晴', temperature: null,
      cloud: 0.12, cloudCover: 0.12, precipType: 'none', precipLevel: 0, windLevel: 0,
      windSpeed: 0, windFrom: 0, windDir: 1, validTime: '', updatedAt: '', source: '天气暂不可用' };
  }
}
