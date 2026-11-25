import { z } from 'zod';
import type { WeatherData } from './api.interface';
import { dayInfo } from './hefei-sky';

import { conditions } from './weather-conditions';
export { conditions } from './weather-conditions';

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
