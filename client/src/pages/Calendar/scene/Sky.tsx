import React, { useEffect, useRef } from 'react';
import { StaticSky } from './StaticSky';
import vertex from './sky.vert?raw';
import fragment from './sky.frag?raw';
import type { WeatherData } from '../../../../../shared/api.interface';
import type { FestivalKey } from '../../../../../shared/festivals';
export function Sky({
  weather,
  night,
  theme,
}: {
  weather?: WeatherData;
  night: boolean;
  theme?: FestivalKey;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
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
      staticSky = false;
    function paint(now: number) {
      const target = small.matches ? 1000 / 30 : 1000 / 60;
      if (last && now - last < target - 1) {
        raf = requestAnimationFrame(paint);
        return;
      }
      if (last && now - last > 90) slow++;
      else slow = Math.max(0, slow - 1);
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
      const t = now / 1000,
        hr = (Date.now() / 3600000 + 8) % 24,
        arc = night
          ? (hr >= 18 ? (hr - 18) / 12 : (hr + 6) / 12) % 1
          : Math.max(0.03, Math.min(0.97, (hr - 6) / 12)),
        sunY = 0.3 + 0.57 * Math.sin(arc * Math.PI),
        wind = (weather?.windSpeed || 4) * Math.cos(((weather?.windFrom || 0) * Math.PI) / 180);
      two('uResolution', w, h);
      one('uAspect', w / h);
      one('uPxScale', w / innerWidth);
      one('uTime', t);
      two('uSunPos', arc, sunY);
      one('uSunVis', night ? 0 : 1);
      one('uDaylight', night ? 0.05 : 0.94);
      one('uWarmth', night ? 0.1 : 0.48);
      const harvestMoon = theme === 'moon' && night;
      // The festival moon sits in the margin outside the opaque planner cards.
      three('uMoon', harvestMoon ? 0.94 : 0.17 + 0.64 * arc,
        harvestMoon ? (small.matches ? 0.91 : 0.79) : night ? Math.max(0.65, sunY) : 0.55, night ? 1 : 0);
      one('uFullMoon', theme === 'moon' ? 1 : 0);
      one('uMoonScale', theme === 'moon' ? 3.8 : 1.35);
      one('uCloudCover', weather?.cloud ?? 0.3);
      one('uWindStretch', 0.25);
      two('uCloudFar', t * 0.001, 0);
      two('uCloudNear', t * 0.002, 0);
      two('uScudShift', t * 0.003, 0);
      const scene = weather?.scene || '';
      one('uRain', /rain|storm/i.test(scene) ? (/heavy|storm/i.test(scene) ? 2.5 : 1) : 0);
      one('uSnow', /snow/i.test(scene) ? 1.8 : 0);
      one('uRainSlope', wind / 50 + 0.04 * Math.sin(t));
      three('uRainFall', t * 550, t * 420, t * 300);
      three('uSnowFall', t * 0.08, t * 0.05, t * 0.03);
      three('uSnowDrift', t * 0.006, t * 0.009, t * 0.014);
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
    restart();
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('visibilitychange', restart);
      window.removeEventListener('resize', restart);
      reduce.removeEventListener('change', restart);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [weather, night, theme]);
  return (
    <div aria-hidden className={'sky-back ' + (night ? 'night' : 'day')}>
      <StaticSky night={night} weather={weather} moon={theme === 'moon'} />
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
