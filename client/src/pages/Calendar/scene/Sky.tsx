import { projectSkyBodies, type SkyBand, skyAt } from '../../../../../shared/hefei-sky';
import React, { useEffect, useRef } from 'react';
import { StaticSky } from './StaticSky';
import vertex from './sky.vert?raw';
import fragment from './sky.frag?raw';
import type { WeatherData } from '../../../../../shared/api.interface';
import type { FestivalKey } from '../../../../../shared/festivals';
export function Sky({
  band,
  weather,
  sky,
  night,
  theme,
}: {
  band: SkyBand;
  weather?: WeatherData;
  sky: ReturnType<typeof skyAt>;
  night: boolean;
  theme?: FestivalKey;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef({ sky, weather, band });
  useEffect(() => { current.current = { sky, weather, band }; }, [sky, weather, band]);
  useEffect(() => {
    const canvas = ref.current!,
      gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!gl) return;
    function shader(type: number, src: string) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram()!,
      vs = shader(gl.VERTEX_SHADER, vertex),
      fs = shader(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    const buf = gl.createBuffer();
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const pos = gl.getAttribLocation(prog, 'aPosition');
    if (pos >= 0) {
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    }
    const uniforms = new Map<string, WebGLUniformLocation>();
    function loc(n: string) {
      if (!uniforms.has(n)) uniforms.set(n, gl.getUniformLocation(prog, n));
      return uniforms.get(n);
    }
    const one = (n: string, v: number) => gl.uniform1f(loc(n), v),
      two = (n: string, x: number, y: number) => gl.uniform2f(loc(n), x, y),
      three = (n: string, x: number, y: number, z: number) => gl.uniform3f(loc(n), x, y, z);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)'),
      small = matchMedia('(max-width: 800px)');
    let raf = 0,
      last = 0,
      slow = 0,
      staticSky = false, t = 0, drift = 0, fall = 0;
    let cover = current.current.weather?.cloudCover ?? 0.12;
    let rain = 0, snow = 0;
    function paint(now: number) {
      const target = small.matches ? 1000 / 30 : 1000 / 60;
      if (last && now - last < target - 1) {
        raf = requestAnimationFrame(paint);
        return;
      }
      if (last && now - last > 90) slow++;
      else slow = Math.max(0, slow - 1);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (slow > 12 || gl.isContextLost() || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        staticSky = true;
        canvas.style.opacity = '0';
        return;
      }
      const w = Math.round(innerWidth * (small.matches ? 0.7 : 0.65)),
        h = Math.round(innerHeight * (small.matches ? 0.7 : 0.65));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      const { sky: light, weather: observation } = current.current;
      const { sun, moon, moonScale } = projectSkyBodies(light, innerWidth, innerHeight, current.current.band, theme === 'moon' && night);
      const strength = Math.min(1, (observation?.windSpeed ?? 0) / 65);
      const direction = observation?.windDir ?? 1;
      const blend = reduce.matches || !dt ? 1 : 1 - Math.exp(-dt * 2);
      const level = observation?.precipLevel ?? 0;
      cover += ((observation?.cloudCover ?? 0.12) - cover) * blend;
      rain += ((observation?.precipType === 'rain' ? level : 0) - rain) * blend;
      snow += ((observation?.precipType === 'snow' ? level : 0) - snow) * blend;
      t += dt;
      drift += dt * direction * (0.08 + strength);
      fall += dt * (1 + (rain + snow) * 0.14);
      two('uResolution', w, h);
      one('uAspect', w / h);
      one('uPxScale', w / innerWidth);
      one('uTime', t);
      two('uSunPos', sun.x, sun.y);
      one('uSunVis', light.vis);
      one('uDaylight', light.daylight);
      one('uWarmth', light.warmth);
      one('uTwilight', light.twilight);
      three('uMoon', moon.x, moon.y, 1);
      one('uFullMoon', theme === 'moon' ? 1 : 0);
      one('uMoonScale', moonScale);
      one('uCloudCover', cover);
      one('uWindStretch', strength);
      one('uScud', strength * strength);
      two('uCloudFar', -drift * 0.009, 0);
      two('uCloudNear', -drift * 0.018, 0);
      two('uScudShift', -drift * 0.035, 0);
      const pass = Math.sin(drift * 0.28 - 0.9);
      three('uHeroCloud', sun.x * w / h + 0.54 * pass, sun.y + 0.012,
        Math.max(0, 1 - Math.abs(cover - 0.48) * 4));
      one('uRain', rain * 0.6);
      one('uSnow', snow * 0.6);
      one('uRainSlope', direction * strength * (0.75 + 0.10 * Math.sin(t)));
      three('uRainFall', fall * 270, fall * 420, fall * 550);
      three('uSnowFall', fall * 0.028, fall * 0.052, fall * 0.08);
      three('uSnowDrift', drift * 0.035, drift * 0.08, drift * 0.14);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      canvas.style.opacity = '1';
      if (!reduce.matches && !document.hidden) raf = requestAnimationFrame(paint);
    }
    function restart() {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden && !staticSky) paint(performance.now());
    }
    const lost = (e: Event) => {
      e.preventDefault();
      canvas.style.opacity = '0';
      cancelAnimationFrame(raf);
    };
    canvas.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', restart);
    window.addEventListener('resize', restart);
    reduce.addEventListener('change', restart);
    // Still frames also follow the clock and observations when motion is reduced.
    const stillClock = window.setInterval(() => { if (reduce.matches) restart(); }, 1000);
    restart();
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(stillClock);
      canvas.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('visibilitychange', restart);
      window.removeEventListener('resize', restart);
      reduce.removeEventListener('change', restart);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [night, theme]);
  return (
    <div aria-hidden className={'sky-back ' + (night ? 'night' : 'day')}>
      <StaticSky band={band} sky={sky} night={night} weather={weather} moon={theme === 'moon'} />
      <canvas ref={ref} />
      {theme === 'halloween' && (
        <picture>
          <source
            media="(max-width: 700px)"
            srcSet={'/assets/festivals/halloween/' + (night ? 'night' : 'day') + '-mobile.webp'}
          />
          <img
            alt=""
            src={'/assets/festivals/halloween/' + (night ? 'night' : 'day') + '-desktop-v2.webp'}
          />
        </picture>
      )}
    </div>
  );
}
