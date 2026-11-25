import { projectSun, skyAt } from '../../../../../shared/hefei-sky';
import React, { useEffect, useRef } from 'react';
import type { WeatherData } from '../../../../../shared/api.interface';
export function StaticSky({
  sky,
  night,
  weather,
  moon,
}: {
  sky: ReturnType<typeof skyAt>;
  night: boolean;
  weather?: WeatherData;
  moon: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current!,
      ctx = el.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const w = (el.width = innerWidth),
        h = (el.height = innerHeight);
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, night ? '#20274e' : weather?.cloud > 0.7 ? '#93acbc' : '#91c8e0');
      gradient.addColorStop(1, night ? '#4b5073' : sky.warmth > 0.3 ? '#f9c6a8' : '#f1ecda');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      const sun = projectSun(sky.elev, sky.az, w, h);
      const x = w * (night ? (moon ? 0.94 : sky.moonX) : sun.x);
      const y = h * (1 - (night ? sky.moonY : sun.y));
      const r = moon && night ? 29 : 16;
      if (night && (weather?.cloudCover ?? 0) < 0.85) {
        for (let i = 1; i <= 75; i++) {
          ctx.fillStyle = i % 3 ? '#d9dcf29c' : '#fff1db';
          ctx.fillRect((i * 0.618 % 1) * w, (i * i * 0.413 % 1) * h, i % 2 + 1, 1);
        }
      }
      if ((weather?.cloudCover ?? 0.12) < 0.92 && !(weather?.precipLevel >= 2)) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        glow.addColorStop(0, '#fff4d5');
        glow.addColorStop(0.23, night ? '#ecebf9' : '#fff7cf');
        glow.addColorStop(0.27, '#ffedba66');
        glow.addColorStop(1, '#fff2bb00');
        ctx.fillStyle = glow;
        ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      }
      for (let i = 0; i < Math.ceil((weather?.cloud ?? 0.3) * 16); i++) {
        const cx = ((i * 0.317) % 1) * w,
          cy = (0.2 + ((i * 0.193) % 0.55)) * h;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, w * 0.12);
        g.addColorStop(0, night ? '#65768455' : '#ffffff77');
        g.addColorStop(1, '#ffffff00');
        ctx.save();
        ctx.translate(0, cy);
        ctx.scale(1, 0.34);
        ctx.translate(0, -cy);
        ctx.fillStyle = g;
        ctx.fillRect(cx - w * 0.13, cy - w * 0.13, w * 0.26, w * 0.26);
        ctx.restore();
      }
      // A still frame retains depth and direction on devices without a GL context.
      const level = weather?.precipLevel ?? 0;
      const slope = (weather?.windDir ?? 1) * Math.min(0.8, (weather?.windSpeed ?? 0) / 70);
      for (let i = 1; i <= Math.ceil(w * h / 4800) * level; i++) {
        const px = ((i * 0.6180339887) % 1) * w;
        const py = ((i * i * 0.4142135623) % 1) * h;
        const depth = 1 + i % 3;
        ctx.beginPath();
        if (weather?.precipType === 'snow') {
          ctx.fillStyle = night ? '#e4eaf0ae' : '#fffaf0ae';
          ctx.arc(px, py, depth * 0.9, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#d9e5f080';
          ctx.moveTo(px, py);
          ctx.lineTo(px + slope * depth * 4, py + depth * 4);
          ctx.stroke();
        }
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [sky, night, moon, weather]);
  return <canvas ref={ref} aria-hidden />;
}
