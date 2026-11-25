import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  HemisphereLight,
  DirectionalLight,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  SRGBColorSpace,
  InstancedMesh,
  SphereGeometry,
  Object3D,
  Color,
} from 'three';
import { toyKit } from './duck-model';
import { choreography, stageHeight } from './duck-motion';
import type { Outfit } from './duck-wardrobe';
import type { WeatherData } from '../../../../../shared/api.interface';
import { projectSun, type skyAt } from '../../../../../shared/hefei-sky';

export type Lighting = { sky: ReturnType<typeof skyAt>; weather?: WeatherData };
export function mountDucks(
  canvas: HTMLCanvasElement,
  looks: Outfit[],
  read: () => Lighting,
) {
  const options = {
    alpha: true,
    antialias: true,
    powerPreference: 'low-power' as const,
  };
  const context = canvas.getContext('webgl2', options);
  if (!context || !(context instanceof WebGL2RenderingContext))
    throw new Error('当前浏览器使用静态鸭鸭。');
  const renderer = new WebGLRenderer({ canvas, context, ...options });
  renderer.setClearColor(0, 0);
  const kit = toyKit(),
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 2.7, 0, 0.1, 40);
  camera.position.set(0, 0, 10);
  const hemi = new HemisphereLight(0xfff1dd, 0xf1bd97, 1.65),
    key = new DirectionalLight(0xffe1ad, 2.15),
    fill = new DirectionalLight(0xffdfca, 0.68);
  fill.position.set(-2, 1, 3);
  scene.add(hemi, key, fill);
  const bitmap = document.createElement('canvas');
  bitmap.width = 96;
  bitmap.height = 48;
  const ctx = bitmap.getContext('2d')!;
  ctx.scale(2, 1);
  const grad = ctx.createRadialGradient(24, 24, 1, 24, 24, 24);
  grad.addColorStop(0, 'rgba(62,48,57,.35)');
  grad.addColorStop(0.55, 'rgba(62,48,57,.16)');
  grad.addColorStop(1, 'rgba(62,48,57,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 48, 48);
  const texture = new CanvasTexture(bitmap);
  texture.colorSpace = SRGBColorSpace;
  const shadowMaterial = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
    plane = new PlaneGeometry(1.58, 0.22);
  function assemble(look: Outfit, i: number) {
    const duck = kit.make(look),
      shadow = new Mesh(plane, shadowMaterial);
    scene.add(duck.root, shadow);
    shadow.position.set(0, 0.11, -0.51);
    return { duck, shadow, motion: choreography(duck, i) };
  }
  let flock = looks.map(assemble);
  const grain = new SphereGeometry(0.045, 7, 5),
    ice = new MeshBasicMaterial({ color: 0xc8edff });
  const grains = new InstancedMesh(grain, ice, 24),
    grainPose = new Object3D();
  grains.frustumCulled = false;
  grains.count = 0;
  scene.add(grains);
  const mobile = matchMedia('(max-width:768px)');
  let width = 0,
    height = 0,
    raf = 0,
    last = 0,
    clock = 0,
    lighting: Lighting | undefined,
    wind = 0,
    level = 0;
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(width, height, false);
    const span = (stageHeight * width) / height;
    camera.left = -span / 2;
    camera.right = span / 2;
    camera.top = stageHeight;
    camera.updateProjectionMatrix();
    flock.forEach(({ duck, shadow }, i) => {
      duck.root.position.x = shadow.position.x = ((i - 1) * span) / 3;
      duck.root.position.y = 0.055;
    });
  }
  function light(next: Lighting) {
    const { sky, weather } = next,
      night = sky.phase === 'night',
      cover = weather?.cloudCover ?? 0.12;
    const sun = projectSun(sky.elev, sky.az, width || 1, height || 1);
    const x = night ? sky.moonX : sun.x,
      y = night ? sky.moonY : sun.y;
    hemi.color
      .set(night ? '#b5c9fa' : '#fff3df')
      .lerp(new Color('#cedde8'), cover * 0.55);
    hemi.groundColor.set(night ? '#a996ad' : '#e8ba8d');
    key.color
      .set(night ? '#c0d4ff' : sky.warmth > 0.35 ? '#ffae85' : '#ffe5b5')
      .lerp(new Color('#e0effa'), cover * 0.72);
    key.position.set((x - 0.5) * 8, 1.7 + y * 3, 3.8);
    key.intensity = night ? 1.45 : 2.0 - cover * 0.68;
    hemi.intensity = night ? 1.15 : 1.6 + cover * 0.25;
    fill.intensity = night ? 0.96 : 0.52;
    wind =
      (weather?.windDir ?? 1) * Math.min(1, (weather?.windSpeed ?? 0) / 55);
    level = weather?.precipLevel ?? 0;
    ice.color.set(weather?.precipType === 'snow' ? '#fffcff' : '#a6dcfa');
  }
  function render(now: number) {
    raf = requestAnimationFrame(render);
    const interval = 1000 / (mobile.matches ? 30 : 60),
      delta = now - last;
    if (last && delta < interval - 0.9) return;
    const dt = last ? Math.min(0.06, delta / 1000) : 0;
    last = now - (delta % interval < 1.5 ? delta % interval : 0);
    clock += dt;
    const state = read();
    if (lighting !== state) {
      lighting = state;
      light(state);
    }
    let particles = 0;
    flock.forEach(({ duck, motion }, i) => {
      const feedback = motion.pose(dt, clock, wind, level);
      if (feedback.spray && level > 0)
        for (let n = 0; n < 8; n++) {
          const t = feedback.elapsed,
            a = n * 2.399 + i;
          grainPose.position.set(
            duck.root.position.x + Math.cos(a) * (0.4 + t * 1.25),
            1.05 + t * (1.9 + (n % 3) * 0.28) - 2.5 * t * t,
            0.48 + Math.sin(a) * t,
          );
          grainPose.scale.setScalar(Math.max(0.12, 1 - t));
          grainPose.updateMatrix();
          grains.setMatrixAt(particles++, grainPose.matrix);
        }
    });
    grains.count = particles;
    if (particles) grains.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function resume() {
    cancelAnimationFrame(raf);
    last = 0;
    if (!document.hidden) raf = requestAnimationFrame(render);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  resume();
  document.addEventListener('visibilitychange', resume);
  return {
    dress(next: Outfit[]) {
      flock = next.map((look, i) => {
        const previous = flock[i];
        if (previous.duck.look === look) return previous;
        scene.remove(previous.duck.root, previous.shadow);
        return assemble(look, i);
      });
      resize();
    },
    poke(i: number) {
      const { sky, weather } = read();
      return flock[i].motion.poke(
        !!weather?.precipLevel,
        ['night', 'dawn'].includes(sky.phase),
        (weather?.windLevel ?? 0) >= 2,
      );
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      kit.dispose();
      texture.dispose();
      shadowMaterial.dispose();
      plane.dispose();
      grains.dispose();
      grain.dispose();
      ice.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
