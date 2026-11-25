// Low-precision Astronomical Almanac solar coordinates, ported from the original calendar.
const rad = Math.PI / 180;
const latitude = 31.8696 * rad;
const longitude = 117.3154;
const dayMs = 86400000;
const offset = 8 * 3600000;
export const julianDay = (ms: number) => ms / dayMs + 2440587.5;

export function solarPosition(jd: number) {
  const n = jd - 2451545;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ha = (((18.697374558 + 24.06570982441908 * n) % 24) * 15 + longitude) * rad - ra;
  const elev = Math.asin(Math.sin(latitude) * Math.sin(dec) + Math.cos(latitude) * Math.cos(dec) * Math.cos(ha)) / rad;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latitude) - Math.tan(dec) * Math.cos(latitude)) / rad + 180;
  return { elev, az };
}

let cached: { midnight: number; rise: number; set: number; noon: number } | undefined;
export function dayInfo(ms: number) {
  const midnight = Math.floor((ms + offset) / dayMs) * dayMs - offset;
  if (cached?.midnight === midnight) return cached;
  const jd = julianDay(midnight);
  let prev = solarPosition(jd).elev;
  let rise = 0, set = 0, noon = 0, peak = -90;
  for (let t = 2; t <= 1440; t += 2) {
    const e = solarPosition(jd + t / 1440).elev;
    if (prev < -0.833 && e >= -0.833) rise = t - 2 + 2 * (-0.833 - prev) / (e - prev);
    if (prev >= -0.833 && e < -0.833) set = t - 2 + 2 * (-0.833 - prev) / (e - prev);
    if (e > peak) { noon = t; peak = e; }
    prev = e;
  }
  cached = { midnight, rise, set, noon };
  return cached;
}

function smooth(a: number, b: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function skyAt(ms: number) {
  const { elev, az } = solarPosition(julianDay(ms));
  const { midnight, rise, set } = dayInfo(ms);
  const minutes = (ms - midnight) / 60000;
  const nightProgress = ((minutes - set + 1440) % 1440) / (1440 - set + rise);
  const phase = elev < -6 ? 'night' : elev > 10 ? 'day' : az < 180 ? 'dawn' : 'dusk';
  return {
    elev, az, phase, vis: smooth(-1.2, 1, elev), daylight: smooth(-8, 3, elev),
    warmth: (1 - smooth(2, 24, elev)) * smooth(-4, 0.5, elev),
    twilight: smooth(-10, -3, elev) * (1 - smooth(-1, 5, elev)),
    moonX: 0.12 + 0.76 * Math.min(1, nightProgress),
    moonY: 0.73 + 0.13 * Math.sin(Math.PI * Math.min(1, nightProgress)),
  };
}

export function projectSun(elev: number, az: number, width: number, height: number) {
  const band = Math.max(24, Math.min(124, 0.12 * height)) / height;
  const horizon = (1 - 1.08 * band) * (1 - smooth(0.6, 1.2, width / height)) + 0.05 * smooth(0.6, 1.2, width / height);
  const off = Math.min(1, Math.max(-1, (az - 180) / 100));
  const rise = 1 - Math.exp(-Math.max(0, elev) / 16);
  return { x: 0.5 + 0.47 * Math.sign(off) * Math.pow(Math.abs(off), 0.8),
    y: horizon + (1 - 0.42 * band - horizon) * rise };
}
