import React, { useEffect, useRef } from 'react';
import type { FestivalKey } from '../../../../../shared/festivals';
type Bit = { x: number; y: number; vx: number; vy: number; age: number; kind: number };
function symbol(c: CanvasRenderingContext2D, theme: FestivalKey | undefined, night: boolean, i: number) {
  c.fillStyle =
    theme === 'dragon'
      ? '#689778'
      : theme === 'halloween'
        ? night
          ? '#4c3656'
          : '#d47a39'
        : theme === 'spring'
          ? i % 3
            ? '#ffcc68'
            : '#d65a48'
          : theme === 'winter'
            ? '#fffaf1'
            : '#ffc968';
  if (theme === 'spring' && i % 3 === 0) {
    c.fillRect(-4, -6, 8, 12);
    c.fillStyle = '#ffd772';
    c.fillRect(-3, -3, 6, 2);
    return;
  }
  if (theme === 'dragon' || (theme === 'moon' && i % 2) || (theme === 'halloween' && !night)) {
    c.beginPath();
    c.ellipse(0, 0, theme === 'dragon' ? 8 : 5, 2.5, -0.5, 0, 7);
    c.fill();
    return;
  }
  if (theme === 'halloween' && night && i % 3 === 0) {
    c.beginPath();
    c.moveTo(-8, -3);
    c.quadraticCurveTo(-2, -4, 0, 0);
    c.quadraticCurveTo(3, -4, 8, -3);
    c.lineTo(4, 2);
    c.lineTo(0, 4);
    c.lineTo(-4, 2);
    c.fill();
    return;
  }
  if (theme === 'winter' && i % 2) {
    c.strokeStyle = '#fff';
    for (let n = 0; n < 3; n++) {
      c.rotate(Math.PI / 3);
      c.beginPath();
      c.moveTo(-4, 0);
      c.lineTo(4, 0);
      c.stroke();
    }
    return;
  }
  c.beginPath();
  c.arc(0, 0, i % 2 ? 1.7 : 2.6, 0, 7);
  c.fill();
}
export function Particles({
  theme,
  night,
  rain = 0,
  snow = 0,
  ambient = false,
  dusk = false,
  wind = 0,
}: {
  theme?: FestivalKey;
  night: boolean;
  rain?: number;
  snow?: number;
  ambient?: boolean;
  dusk?: boolean;
  wind?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      c = canvas.getContext('2d');
    if (!c) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)'),
      small = matchMedia('(max-width:800px)');
    let raf = 0,
      last = 0,
      clock = 0,
      w = 0,
      h = 0,
      bits: Bit[] = [];
    const seeds = Array.from({ length: 50 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      s: 12 + Math.random() * 20,
      i,
    }));
    let surfaces: DOMRect[] = [];
    function measure() {
      w = innerWidth; h = innerHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      surfaces = [...document.querySelectorAll('.calendar-app .card,.calendar-app .hero')].map((e) => e.getBoundingClientRect());
    }
    function burst() {
      if (reduce.matches) return;
      bits.push(
        ...Array.from({ length: 24 }, (_, i) => ({
          x: w * 0.5,
          y: h * 0.57,
          vx: (Math.random() - 0.5) * 350,
          vy: -65 - Math.random() * 160,
          age: 0,
          kind: i % 3,
        })),
      );
      start();
    }
    function draw(ms: number) {
      raf = 0;
      if (document.hidden || reduce.matches) {
        c.clearRect(0, 0, w, h);
        return;
      }
      if (last && ms - last < (small.matches ? 32 : 16)) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min(0.05, (ms - last) / 1000 || 0);
      last = ms;
      clock += dt;
      c.clearRect(0, 0, w, h);
      if (theme)
        for (const s of seeds.slice(0, small.matches ? 18 : 38)) {
          const y = ((s.y * h + clock * s.s) % (h + 24)) - 12,
            x = (s.x * w + Math.sin(clock * 0.6 + s.i) * 22 + clock * wind * 0.2 + w * 8) % w;
          c.save();
          c.translate(x, y);
          c.rotate(Math.sin(clock + s.i));
          c.globalAlpha = 0.66;
          symbol(c, theme, night, s.i);
          c.restore();
        }
      if (ambient) {
        for (const seed of seeds.slice(0, small.matches ? 18 : 34)) {
          const x = ((seed.x * w + clock * (3 + wind * 0.5)) % w + w) % w;
          const y = ((seed.y * h - clock * (1 + seed.s / 14)) % h + h) % h;
          const windy = Math.abs(wind) >= 29 && seed.i % 4 === 0;
          c.fillStyle = windy ? '#b6ab7ea6' : night ? '#eee7c5' : dusk ? '#ffd69b' : '#fff2b8';
          c.globalAlpha = 0.28 + 0.2 * Math.sin(clock + seed.i);
          c.beginPath();
          c.ellipse(x, y, windy ? 5 : 1.2, windy ? 1.3 : 1.2, Math.sin(clock + seed.i), 0, 2 * Math.PI);
          c.fill();
          if (windy) {
            c.strokeStyle = '#ffffff70';
            c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - wind * 0.4, y + 1, x - wind, y - 3); c.stroke();
          }
        }
        c.globalAlpha = 1;
      }
      for (const r of surfaces) {
        if ((!rain && !snow) || r.top < 0 || r.top > h + 20) continue;
        const left = r.left + 22, width = r.width - 44;
        if (width <= 0) continue;
        if (snow) {
          // Multi-scale drift profile; the leeward edge collects the deeper cap.
          c.beginPath();
          c.moveTo(left, r.top + 1);
          for (let px = 0; px <= width; px += 2) {
            const u = px / width;
            const profile = 0.65 + 0.16 * Math.sin(px / 29) + 0.12 * Math.sin(px / 11);
            const lean = 1 + Math.max(-0.42, Math.min(0.42, wind / 100)) * (2 * u - 1);
            const taper = Math.min(1, px / 14, (width - px) / 14);
            c.lineTo(left + px, r.top - (1 + snow * 1.75) * profile * lean * taper);
          }
          c.lineTo(left + width, r.top + 1); c.closePath();
          c.fillStyle = night ? '#d8dff1' : '#fbfdff'; c.fill();
        }
        if (rain) {
          const count = Math.ceil(width * (1 + rain * 2) / 260);
          c.strokeStyle = night ? '#c1d6efb3' : '#d8f2ffdb';
          c.lineWidth = 1.15;
          for (let i = 0; i < count; i++) {
            const beat = clock * (0.6 + rain * 0.24) + i * 0.618;
            const t = beat % 1;
            const x = left + width * ((i * 0.618 + Math.floor(beat) * 0.371 + 0.1) % 1);
            c.beginPath();
            if (t < 0.35) {
              const height = 60 * (0.35 - t);
              c.moveTo(x - height * wind / 70, r.top - height);
              c.lineTo(x - (height + 6) * wind / 70, r.top - height - 6);
            } else {
              const age = (t - 0.35) / 0.65;
              const crest = (4 + rain) * Math.sin(Math.PI * age);
              const spread = (3 + rain) * age;
              c.moveTo(x - spread, r.top - crest); c.quadraticCurveTo(x, r.top + crest * 0.3, x + spread, r.top - crest);
              c.moveTo(x + spread + age * wind / 12, r.top - crest * 1.7);
              c.lineTo(x + spread + age * wind / 12 + 1, r.top - crest * 1.7 - 1);
            }
            c.stroke();
          }
        }
      }
      bits = bits.filter((b) => b.age < 1.2);
      canvas.classList.toggle('celebrating', bits.length > 0);
      for (const b of bits) {
        b.age += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy += 250 * dt;
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.age * 4);
        c.globalAlpha = Math.max(0, 1 - b.age / 1.2);
        symbol(c, b.kind ? 'spring' : 'dragon', false, b.kind);
        c.restore();
      }
      if (theme || ambient || rain || snow || bits.length) raf = requestAnimationFrame(draw);
    }
    function start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(draw);
      }
    }
    measure();
    start();
    const refresh = () => {
      measure();
      start();
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(document.body);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('duck-celebrate', burst);
    document.addEventListener('visibilitychange', start);
    reduce.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('duck-celebrate', burst);
      document.removeEventListener('visibilitychange', start);
      reduce.removeEventListener('change', start);
    };
  }, [theme, night, rain, snow, wind, ambient, dusk]);
  return <canvas ref={ref} className="particle-layer" aria-hidden />;
}
