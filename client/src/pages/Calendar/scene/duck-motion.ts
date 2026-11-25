import { Box3 } from 'three';
import type { Duck } from './duck-model';
import { shuffle } from './duck-wardrobe';

export const stageHeight = 2.54;
const actions = [
  'tilt',
  'flutter',
  'bounce',
  'shake',
  'spin',
  'adjust',
  'stretch',
  'hide',
  'pat',
  'waddle',
  'bow',
  'kick',
] as const;
type Action = (typeof actions)[number];
export function choreography(duck: Duck, slot: number) {
  let bag: Action[] = [],
    action: Action = 'tilt',
    elapsed = 2,
    turns = 0;
  // A damped second-order spring follows the gesture envelope, including on a repeated tap.
  const springs = Object.fromEntries(
    actions.map((name) => [name, { value: 0, velocity: 0 }]),
  ) as Record<Action, { value: number; velocity: number }>;
  let turn = 0,
    angularVelocity = 0;
  const homeHat = duck.hat.rotation.z;
  const poseBounds = new Box3();
  function poke(wet: boolean, sleepy: boolean, windy: boolean) {
    if (!bag.length) {
      bag = shuffle(actions);
      const preferred = wet
        ? 'shake'
        : sleepy
          ? 'stretch'
          : windy
            ? 'adjust'
            : null;
      if (preferred) {
        const index = bag.indexOf(preferred);
        bag.push(...bag.splice(index, 1));
      }
    }
    action = bag.pop()!;
    elapsed = 0;
    springs[action].velocity += 5;
    if (action === 'spin') turns += Math.PI * 2;
    return action;
  }
  function pose(dt: number, time: number, wind: number, level: number) {
    elapsed += dt;
    const target =
      elapsed < 0.86
        ? Math.sin((Math.PI * Math.min(1, elapsed / 0.18)) / 2)
        : 0;
    // Substep so 30 Hz and 60 Hz have the same stable response.
    for (let remaining = dt; remaining > 0; remaining -= 1 / 120) {
      const h = Math.min(1 / 120, remaining);
      for (const name of actions) {
        const spring = springs[name];
        if (
          name !== action &&
          Math.abs(spring.value) + Math.abs(spring.velocity) < 0.0001
        )
          continue;
        spring.velocity +=
          (((name === action ? target : 0) - spring.value) * 112 -
            spring.velocity * 13) *
          h;
        spring.value += spring.velocity * h;
      }
      angularVelocity += ((turns - turn) * 54 - angularVelocity * 12) * h;
      turn += angularVelocity * h;
    }
    const weight = (name: Action) => springs[name].value;
    const wave = Math.sin(elapsed * 17),
      beat = Math.sin(elapsed * 11),
      slow = Math.sin(time * 2 + slot);
    const bounce = weight('bounce') * Math.abs(beat),
      flap = weight('flutter'),
      hiding = weight('hide');
    const stride = weight('waddle'),
      lean = weight('pat'),
      stretch = weight('stretch'),
      bow = weight('bow'),
      kick = weight('kick');
    const hop = 0.28 * bounce + flap * 0.14 + kick * 0.09;
    duck.root.rotation.y =
      turn +
      0.2 * (slot - 1) +
      0.055 * slow +
      weight('shake') * 0.43 * wave +
      stride * 0.28 * beat;
    duck.body.position.y = hop + 0.013 * (1 + slow);
    duck.body.scale.set(
      1 - 0.08 * bounce,
      1 + 0.17 * bounce + 0.09 * stretch - 0.1 * hiding,
      1 - 0.02 * bounce,
    );
    duck.body.rotation.set(
      -lean * 0.32 + bow * 0.29,
      0,
      stride * 0.19 * beat + kick * 0.19 + wind * 0.025,
    );
    duck.head.position.y = 1.05 + stretch * 0.12 - hiding * 0.19 - bow * 0.08;
    duck.head.rotation.set(
      -stretch * 0.3 + bow * 0.44 + Math.sin(time * 0.86 + slot) * 0.025,
      weight('shake') * wave * 0.39,
      weight('tilt') * 0.44 + weight('adjust') * 0.14,
    );
    const blink = (time + slot * 0.83) % 3.7;
    duck.eyes.scale.y = Math.max(
      0.09,
      1 -
        (blink < 0.13 ? Math.sin((Math.PI * blink) / 0.13) : 0) -
        weight('tilt') * 0.6 -
        stretch * 0.6,
    );
    duck.beak.scale.y = 1 + stretch * 0.7;
    duck.wings.forEach((wing, i) => {
      const s = i * 2 - 1;
      wing.rotation.z =
        s *
        (flap * (0.8 + 0.53 * wave) +
          hiding * 1.95 +
          lean * (0.64 + beat * 0.26) +
          stretch * 0.92 +
          (i ? weight('adjust') * 2 : 0));
      wing.rotation.x = -hiding * 0.82 - lean * 0.64;
      duck.feet[i].position.y =
        0.115 +
        hop +
        Math.max(0, s * beat) * stride * 0.13 +
        (i ? kick * (0.19 + 0.08 * beat) : 0);
      duck.feet[i].rotation.x = i ? -kick * 0.67 : 0;
    });
    duck.glasses.position.y = weight('adjust') * 0.075;
    duck.hat.rotation.z =
      homeHat + wind * 0.09 + weight('adjust') * wave * 0.13;
    duck.cloth.rotation.z = wind * (0.44 + 0.12 * Math.sin(time * 5));
    duck.prop.rotation.z =
      duck.look === 'umbrella' || duck.look === 'leaf'
        ? wind * (0.17 + (0.025 + 0.012 * level) * Math.sin(time * 6))
        : Math.sin(time * 2) * 0.025;
    // Give each weather companion its own idle pose beneath the touch reactions.
    const look = duck.look;
    if (look === 'nightcap') {
      duck.head.rotation.x += 0.17 + 0.09 * slow;
      duck.eyes.scale.y *= 0.38;
    }
    if (look === 'gaze' || look === 'catchSnow' || look === 'telescope')
      duck.head.rotation.x -= 0.22 + 0.07 * slow;
    if (look === 'shades' || look === 'fishing') {
      duck.body.rotation.x -= 0.16;
      duck.body.position.y -= 0.06;
    }
    if (look === 'wave')
      duck.wings[1].rotation.z += 1.29 + 0.27 * Math.sin(time * 3.6);
    if (look === 'beret' || look === 'brace')
      duck.wings[wind < 0 ? 0 : 1].rotation.z +=
        (wind < 0 ? -1 : 1) * (0.8 + 0.9 * Math.abs(wind));
    if (look === 'brace') duck.head.position.y -= 0.1 * Math.abs(wind);
    if (look === 'book') {
      duck.page.rotation.y =
        0.3 + 0.28 * Math.sin(time * (1.2 + Math.abs(wind)));
      duck.head.rotation.x += 0.12;
    }
    if (look === 'cocoa' || look === 'coffee') {
      duck.plume.position.y = 0.07 * (1 + slow);
      duck.plume.scale.setScalar(0.85 - 0.13 * slow);
      duck.prop.position.y = 0.68 + 0.09 * slow;
    }
    if (look === 'slicker')
      duck.feet[1].position.y += level * 0.01 * (1 + slow);
    if (look === 'fishing' || look === 'straw')
      duck.prop.rotation.z += 0.07 * Math.sin(time * 1.5) + wind * 0.065;
    if (look === 'catchSnow')
      duck.prop.position.y = 0.78 + 0.08 * Math.sin(time * (1 + level * 0.2));
    // Keep the cap, umbrella and feet inside the stage even for interrupted springs.
    duck.root.position.y = 0;
    duck.root.scale.setScalar(1);
    poseBounds.setFromObject(duck.root);
    const floor = Math.min(0, poseBounds.min.y);
    const scale = Math.min(
      1,
      (stageHeight - 0.09) / (poseBounds.max.y - floor),
    );
    duck.root.scale.setScalar(scale);
    duck.root.position.y = 0.055 - floor * scale;
    return { spray: action === 'shake' && elapsed < 0.68, elapsed };
  }
  return { poke, pose };
}
