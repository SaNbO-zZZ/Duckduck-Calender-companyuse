import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Occasion = 'registration' | 'birthday';
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  gravity: number;
  star: boolean;
};
export function scatter(kind: Occasion, anchor: Element | DOMRect | null) {
  if (!anchor) return;
  window.dispatchEvent(
    new CustomEvent('calendar-sparkles', {
      detail: {
        kind,
        rect:
          anchor instanceof Element ? anchor.getBoundingClientRect() : anchor,
      },
    }),
  );
}
export function InteractionDust() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let sparks: Spark[] = [],
      raf = 0,
      last = 0,
      lastTrail = 0;
    function paint(now: number) {
      raf = 0;
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of sparks) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += s.gravity * dt;
        ctx.globalAlpha = Math.max(0, 1 - s.age / s.life) * 0.92;
        ctx.fillStyle = s.star ? '#ffdc8e' : '#fff0c4';
        ctx.beginPath();
        if (s.star) {
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4,
              r = (i % 2 ? 0.32 : 1) * s.size;
            const x = s.x + Math.cos(a) * r,
              y = s.y + Math.sin(a) * r;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
        } else ctx.arc(s.x, s.y, s.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      sparks = sparks.filter((s) => s.age < s.life);
      ctx.globalAlpha = 1;
      if (sparks.length) raf = requestAnimationFrame(paint);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function start() {
      if (canvas.width !== innerWidth) canvas.width = innerWidth;
      if (canvas.height !== innerHeight) canvas.height = innerHeight;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(paint);
      }
    }
    function reset() {
      cancelAnimationFrame(raf);
      raf = 0;
      sparks = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function burst(event: Event) {
      if (reduce.matches || document.hidden) return;
      const { kind, rect: r } = (
        event as CustomEvent<{ kind: Occasion; rect: DOMRect }>
      ).detail;
      const birthday = kind === 'birthday';
      for (let i = 0; i < 32; i++) {
        const a = (Math.PI * 2 * (i + Math.random() * 0.5)) / 32,
          speed = 45 + Math.random() * 67;
        sparks.push({
          x: r.left + r.width * (0.5 + (birthday ? 0.49 * Math.cos(a) : 0)),
          y: r.top + r.height * (0.5 + (birthday ? 0.43 * Math.sin(a) : 0)),
          vx: Math.cos(a) * (birthday ? 12 : speed),
          vy: birthday ? -6 + Math.random() * 20 : Math.sin(a) * speed - 21,
          gravity: birthday ? 22 : 64,
          age: 0,
          life: 0.65 + Math.random() * 0.55,
          size: 1.3 + Math.random() * 2.6,
          star: i % 3 === 0,
        });
      }
      start();
    }
    function trail(event: PointerEvent) {
      const t = performance.now();
      if (reduce.matches || document.hidden || t - lastTrail < 36) return;
      if (
        !(event.target instanceof Element) ||
        event.target.closest(
          'button,a,input,[role="dialog"],.card,.planner-bar,.phone-dock',
        )
      )
        return;
      const stage = document
        .querySelector('.duck-stage')
        ?.getBoundingClientRect();
      if (!stage || event.clientY > stage.bottom || event.clientY < 0) return;
      lastTrail = t;
      for (let i = 0; i < 2; i++)
        sparks.push({
          x: event.clientX + (Math.random() - 0.5) * 7,
          y: event.clientY,
          vx: -event.movementX * 0.12,
          vy: 6 + Math.random() * 14,
          gravity: 9,
          age: 0,
          life: 0.32 + Math.random() * 0.26,
          size: 1.6 + Math.random(),
          star: i === 0,
        });
      start();
    }
    document.addEventListener('pointermove', trail, { passive: true });
    document.addEventListener('visibilitychange', reset);
    reduce.addEventListener('change', reset);
    window.addEventListener('calendar-sparkles', burst);
    return () => {
      reset();
      document.removeEventListener('pointermove', trail);
      document.removeEventListener('visibilitychange', reset);
      reduce.removeEventListener('change', reset);
      window.removeEventListener('calendar-sparkles', burst);
    };
  }, []);
  return createPortal(
    <canvas className="interaction-dust" ref={ref} aria-hidden="true" />,
    document.body,
  );
}
