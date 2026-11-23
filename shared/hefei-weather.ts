import { z } from 'zod';
import type { WeatherData } from './api.interface';

export async function hefeiWeather(): Promise<WeatherData> {
  try {
    const response = await fetch('https://www.nmc.cn/rest/weather?stationid=xqcji', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DuckCalendar/3.0)',
        Referer: 'https://www.nmc.cn/publish/forecast.html',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('weather-source-unavailable');
    const data = z
      .object({
        code: z.literal(0),
        data: z.object({
          real: z.object({
            publish_time: z.string(),
            station: z.object({ city: z.literal('合肥') }),
            weather: z.object({ info: z.string(), rain: z.coerce.number() }),
            wind: z.object({ speed: z.coerce.number(), degree: z.coerce.number() }),
          }),
        }),
      })
      .parse(await response.json());
    const real = data.data.real,
      published = Date.parse(real.publish_time.replace(' ', 'T') + ':00+08:00'),
      now = Date.now();
    if (
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(real.publish_time) ||
      !Number.isFinite(published) ||
      now - published > 90 * 60000 ||
      published - now > 5 * 60000
    )
      throw new Error('weather-stale');
    const info = real.weather.info.trim(),
      rain = real.weather.rain;
    const clouds = {
      clear: 0.12,
      partly: 0.5,
      overcast: 0.9,
      lightRain: 0.9,
      heavyRain: 0.97,
      storm: 1,
      lightSnow: 0.82,
      snow: 0.9,
      heavySnow: 0.98,
    };
    let scene: keyof typeof clouds;
    if (/雪/.test(info))
      scene = /暴雪|大雪/.test(info) ? 'heavySnow' : /小雪/.test(info) ? 'lightSnow' : 'snow';
    else if (/特大暴雨|大暴雨|暴雨/.test(info)) scene = 'storm';
    else if (/大雨|中雨|雷阵雨/.test(info)) scene = 'heavyRain';
    else if (/雨/.test(info)) scene = 'lightRain';
    else if (rain > 0 && rain < 1000 && !/晴/.test(info)) scene = 'lightRain';
    else if (/多云|少云/.test(info)) scene = 'partly';
    else if (/阴|雾|霾|沙尘/.test(info)) scene = 'overcast';
    else if (/晴/.test(info)) scene = 'clear';
    else {
      // 中国气象局偶尔会在实况有效时返回 info:"-" / img:"9999"。
      // 此时实况时间、雨量和风速仍可用；不要把单个缺失的天气描述升级成整块天气不可用，
      // 采用保守的阴天场景，同时保留风速、风向和时间，让页面继续显示并保持动画运行。
      scene = rain > 0 ? 'lightRain' : 'overcast';
    }
    const cloud = clouds[scene];
    const speed = real.wind.speed,
      degree = real.wind.degree;
    return {
      available: true,
      scene,
      windSpeed: Number.isFinite(speed) && speed >= 0 && speed < 100 ? speed * 3.6 : 0,
      windFrom: Number.isFinite(degree) && degree >= 0 && degree < 360 ? degree : 0,
      cloud,
      validTime: new Date(published).toISOString(),
      updatedAt: new Date(published).toISOString(),
      source: '合肥天气',
    };
  } catch {
    return {
      available: false,
      scene: 'overcast',
      windSpeed: 0,
      windFrom: 0,
      cloud: 0.9,
      validTime: '',
      updatedAt: '',
      source: '天气暂不可用',
    };
  }
}
