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
  rain,
  snow,
  wind = 0,
}: {
  theme?: FestivalKey;
  night: boolean;
  rain?: boolean;
  snow?: boolean;
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
      w = canvas.width = innerWidth;
      h = canvas.height = innerHeight;
      surfaces = [...document.querySelectorAll('.card,.hero')].map((e) => e.getBoundingClientRect());
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
      if (rain || snow)
        for (const r of surfaces) {
          if (r.top < 0 || r.top > h) continue;
          c.strokeStyle = rain ? '#90cedd' : '#fff';
          c.lineWidth = snow ? 3 : 1;
          for (let i = 0; i < 12; i++) {
            let x = r.left + 12 + ((r.width - 24) * (i + 0.5)) / 12;
            const t = (clock * 2 + i * 0.37) % 1;
            c.beginPath();
            if (rain) {
              c.moveTo(x - 5 * t, r.top - 8 * Math.sin(t * 3.14));
              c.lineTo(x - 3 * t, r.top - 4 * Math.sin(t * 3.14));
            } else {
              c.moveTo(x - 7, r.top);
              c.quadraticCurveTo(x, r.top - 4 - Math.sin(i), x + 8, r.top);
            }
            c.stroke();
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
      if (theme || rain || snow || bits.length) raf = requestAnimationFrame(draw);
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
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('duck-celebrate', burst);
    document.addEventListener('visibilitychange', start);
    reduce.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('duck-celebrate', burst);
      document.removeEventListener('visibilitychange', start);
      reduce.removeEventListener('change', start);
    };
  }, [theme, night, rain, snow, wind]);
  return <canvas ref={ref} className="particle-layer" aria-hidden />;
}
