import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import { DuckArt } from './duck-art';
import type { WeatherData } from '../../../../../shared/api.interface';
const costumes = [
  'pumpkin-reader',
  'ghost',
  'coffee',
  'witch-cauldron',
  'detective',
  'mummy',
  'skeleton',
  'vampire',
  'broom-witch',
];
type Sprite = { w: number; h: number; px: Uint8Array };
function paint(canvas: HTMLCanvasElement, r: Sprite, night: boolean) {
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(r.w, r.h);
  r.px.forEach((v, i) => {
    if (v) {
      const [red, g, b] = DuckArt.PALETTE[v];
      image.data.set([red * (night ? 0.91 : 1), g * (night ? 0.91 : 1), b, 255], 4 * i);
    }
  });
  ctx.putImageData(image, 0, 0);
}
export function WeatherDucks({
  weather,
  phase,
  halloween,
}: {
  weather?: WeatherData;
  phase: string;
  halloween: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    axios
      .get('/assets/weather-sprites/embed-sprites.json', { signal: ac.signal })
      .then((r) => r.data)
      .then((v) => setReady(DuckArt.installEmbeds(v)))
      .catch(() => {});
    return () => ac.abort();
  }, []);
  const scene = weather?.scene || 'clear',
    family =
      { clear: 'sunny', partly: 'cloudy', overcast: 'cloudy', storm: 'heavyRain', snow: 'heavySnow' }[
        scene
      ] || scene,
    night = phase === 'night';
  const pool = DuckArt.ACTIONS.filter((a) => a.families.includes(family) && a.phases.includes(phase)),
    actions = Array.from(
      { length: 9 },
      (_, i) =>
        (pool.length ? pool : DuckArt.ACTIONS)[
          (i + Math.floor((Date.now() + 28800000) / 86400000)) % (pool.length || DuckArt.ACTIONS.length)
        ],
    );
  const key = actions.map((a) => a.id).join(','),
    wind = Math.max(
      -1,
      Math.min(
        1,
        ((weather?.windSpeed || 0) / 40) * Math.cos(((weather?.windFrom || 0) * Math.PI) / 180),
      ),
    );
  useEffect(() => {
    if (halloween) return;
    const canvases = root.current.querySelectorAll<HTMLCanvasElement>('button canvas'),
      awning = root.current.querySelector<HTMLCanvasElement>('.awning');
    const shelter = actions.some((a) => DuckArt.support(a.id, family, phase) === 'awning');
    let tick = 0;
    function draw() {
      if (document.hidden) return;
      canvases.forEach((c, i) => {
        const a = actions[i];
        paint(
          c,
          DuckArt.render({
            action: a.id,
            frame: Math.floor((tick * a.fps) / 6) % a.frames,
            family,
            phase,
            wind,
            sharedShelter: shelter,
            facing: 1,
          }),
          night,
        );
      });
      if (awning && shelter)
        paint(
          awning,
          DuckArt.canopy({
            width: 680,
            posts: [190, 470],
            color: 'blue',
            wind,
            frame: tick,
            rain: /Rain/.test(family),
            snow: /Snow/.test(family),
          }),
          night,
        );
      tick++;
    }
    draw();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const timer = setInterval(() => {
      if (!media.matches) draw();
    }, 165);
    return () => clearInterval(timer);
  }, [key, wind, phase, ready, halloween]);
  return (
    <div className={'weather-ducks ' + (/snow/i.test(family) ? 'snowy' : '')} ref={root}>
      {!halloween && actions.some((a) => DuckArt.support(a.id, family, phase) === 'awning') && (
        <canvas className="awning" />
      )}
      {actions.map((a, i) => (
        <button key={i} onClick={(event) => {
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
            event.currentTarget.animate([{ translate: '0 0' }, { translate: '0 -5px' }, { translate: '0 0' }], 240);
        }} aria-label={'天气鸭 · ' + a.name}>
          {halloween ? (
            <img src={'/assets/festivals/halloween/ducks/' + costumes[i] + '.webp'} alt="" />
          ) : (
            <canvas />
          )}
        </button>
      ))}
    </div>
  );
}
