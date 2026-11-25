import React, { useEffect, useMemo, useRef, useState } from 'react';
import { wardrobe, chooseFlock, outfits, type Outfit } from './duck-wardrobe';
import type { Lighting, mountDucks } from './duck-renderer';

export function Ducky3DStage({
  weather,
  sky,
  halloween,
}: Lighting & { halloween: boolean }) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<ReturnType<typeof mountDucks> | null>(null);
  const light = useRef<Lighting>({ sky, weather });
  useEffect(() => {
    light.current = { sky, weather };
  }, [sky, weather]);
  const pool = wardrobe(weather, sky.phase, halloween).join(',');
  const looks = useMemo(() => chooseFlock(pool.split(',') as Outfit[]), [pool]);
  const currentLooks = useRef(looks);
  useEffect(() => {
    currentLooks.current = looks;
    engine.current?.dress(looks);
  }, [looks]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current!,
      reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let revision = 0,
      cleanup: () => void = () => {};
    function start() {
      const generation = ++revision;
      cleanup();
      cleanup = () => {};
      setReady(false);
      if (reduce.matches) return;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      el.prepend(canvas);
      const lost = (e: Event) => {
        e.preventDefault();
        ++revision;
        cleanup();
        setReady(false);
      };
      canvas.addEventListener('webglcontextlost', lost);
      cleanup = () => {
        canvas.removeEventListener('webglcontextlost', lost);
        engine.current?.dispose();
        engine.current = null;
        canvas.remove();
      };
      import('./duck-renderer')
        .then(({ mountDucks }) => {
          if (generation !== revision) return;
          engine.current = mountDucks(
            canvas,
            currentLooks.current,
            () => light.current,
          );
          setReady(true);
        })
        .catch(() => {
          if (generation === revision) {
            cleanup();
            setReady(false);
          }
        });
    }
    start();
    reduce.addEventListener('change', start);
    return () => {
      ++revision;
      reduce.removeEventListener('change', start);
      cleanup();
    };
  }, []);
  return (
    <div
      className="toy-stage"
      ref={host}
      data-renderer={ready ? 'three' : 'still'}
    >
      {looks.map((look, i) => (
        <button
          type="button"
          key={look}
          data-outfit={look}
          aria-label={'天气鸭 · ' + outfits[look]}
          aria-disabled={!ready}
          onClick={(e) => {
            const action = engine.current?.poke(i);
            if (action) e.currentTarget.dataset.action = action;
          }}
        >
          {!ready && (
            <img
              src={'/assets/duck-poses/' + look + '.webp'}
              alt=""
              draggable={false}
            />
          )}
        </button>
      ))}
    </div>
  );
}
