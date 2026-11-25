import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CloudSun,
  Palette,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import type { WeatherData } from '../../../../shared/api.interface';
import { conditions } from '../../../../shared/weather-conditions';
import { dayInfo } from '../../../../shared/hefei-sky';

export type WeatherPreview = {
  time: '实时' | '清晨' | '正午' | '傍晚' | '夜晚';
  sky: '实时' | '晴' | '多云' | '阴' | '雨' | '雪';
  level: number;
  wind: number;
};
export const livePreview: WeatherPreview = {
  time: '实时',
  sky: '实时',
  level: 1,
  wind: -1,
};
const winds = ['微风', '和风', '大风', '强风'];
const grades = ['小', '中', '大', '暴', '特大暴'];

export function previewTime(now: number, time: WeatherPreview['time']) {
  if (time === '实时') return now;
  const { midnight, rise, noon, set } = dayInfo(now);
  const minutes = {
    清晨: rise + 18,
    正午: noon,
    傍晚: set - 18,
    夜晚: 22 * 60,
  };
  return midnight + minutes[time] * 60000;
}
export function previewWeather(
  live: WeatherData | undefined,
  preview: WeatherPreview,
): WeatherData | undefined {
  if (preview.sky === '实时' && preview.wind < 0) return live;
  const base = live ?? {
    ...conditions('-', 0),
    available: false,
    temperature: null,
    windLevel: 0,
    windDir: 1 as const,
    windFrom: 0,
    windSpeed: 0,
    sunrise: '',
    sunset: '',
    validTime: '',
    updatedAt: '',
    source: '',
  };
  const { sky, level, wind } = preview;
  const customSky =
    sky === '雨' || sky === '雪' ? grades[level - 1] + sky : sky;
  return {
    ...base,
    ...(sky === '实时' ? {} : conditions(customSky, 0)),
    ...(wind < 0 ? {} : { windLevel: wind, windSpeed: [5, 18, 38, 56][wind] }),
  };
}

export function WeatherMenu({
  value,
  onChange,
  admin,
  onFestival,
  night,
}: {
  value: WeatherPreview;
  onChange: (v: WeatherPreview) => void;
  admin: boolean;
  onFestival: () => void;
  night: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  function select<K extends keyof WeatherPreview>(
    key: K,
    v: WeatherPreview[K],
  ) {
    onChange({ ...value, [key]: v });
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="icon-control" aria-label="日历菜单">
          <SlidersHorizontal size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="sky-menu calendar-glass"
        data-night={night}
        aria-label="日历菜单"
      >
        <Link className="menu-link mobile-charter" to="/charter">
          <BookOpen size={16} />
          鸭鸭公约
        </Link>
        <h2>
          <CloudSun size={18} />
          天气预览
        </h2>
        <p>仅在你的日历中预览。</p>
        <div className="menu-fields">
          <label>
            时段
            <select
              aria-label="时段"
              value={value.time}
              onChange={(e) =>
                select('time', e.target.value as WeatherPreview['time'])
              }
            >
              {['实时', '清晨', '正午', '傍晚', '夜晚'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            天空
            <select
              aria-label="天空"
              value={value.sky}
              onChange={(e) =>
                select('sky', e.target.value as WeatherPreview['sky'])
              }
            >
              {['实时', '晴', '多云', '阴', '雨', '雪'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {(value.sky === '雨' || value.sky === '雪') && (
            <label>
              降水强度
              <select
                aria-label="降水强度"
                value={value.level}
                onChange={(e) => select('level', Number(e.target.value))}
              >
                {grades.map((g, i) => (
                  <option key={g} value={i + 1}>
                    {g}
                    {value.sky}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            风力
            <select
              aria-label="风力"
              value={value.wind}
              onChange={(e) => select('wind', Number(e.target.value))}
            >
              <option value={-1}>实时</option>
              {winds.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="menu-link reset-sky"
          onClick={() => onChange(livePreview)}
        >
          <RotateCcw size={15} />
          恢复合肥实时天气
        </button>
        {admin && (
          <button
            className="menu-link"
            onClick={() => {
              setOpen(false);
              onFestival();
            }}
          >
            <Palette size={15} />
            节日预览
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
