import React, { useEffect, useRef } from 'react';
import type { WeatherData } from '../../../../../shared/api.interface';
export function StaticSky({
  night,
  weather,
  moon,
}: {
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
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, night ? '#172b41' : weather?.cloud > 0.7 ? '#93acbc' : '#91c8e0');
      sky.addColorStop(1, night ? '#465461' : '#f1ecda');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const x = w * 0.85,
        y = h * 0.14,
        r = moon && night ? 29 : 16;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      glow.addColorStop(0, '#fff2bb');
      glow.addColorStop(0.34, night ? '#fff0c4' : '#fff7cf');
      glow.addColorStop(1, '#fff2bb00');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
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
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [night, moon, weather]);
  return <canvas ref={ref} aria-hidden />;
}
