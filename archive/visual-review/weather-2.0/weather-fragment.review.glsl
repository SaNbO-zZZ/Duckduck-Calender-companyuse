// Portable WebGL 1 candidate. uResolution is the drawing-buffer size in pixels.
// Keep UI in a separate DOM layer: this program samples and bends only its sky.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAspect;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform float uCloudCover;
uniform float uRainIntensity;
uniform float uSnowIntensity;
uniform float uIsDay;
uniform float uWeatherType;
uniform float uTimeOfDay;

#define PI 3.14159265359

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec2((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y));
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  // Quintic interpolation keeps broad cloud boundaries smooth.
  vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), s.x),
    mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0, 1.0)), s.x),
    s.y
  );
}

// Exactly three fixed-frequency octaves; no raymarch or derivative extension.
float cloudNoise(vec2 p) {
  return 0.65 * noise(p)
       + 0.25 * noise(p * 2.03 + vec2(8.7, 2.4))
       + 0.10 * noise(p * 4.09 + vec2(1.8, 9.3));
}

float precipitationWeather() {
  return step(1.5, uWeatherType) * (1.0 - step(4.5, uWeatherType));
}

float cloudCoverage() {
  float cover = clamp(uCloudCover * 0.01, 0.0, 1.0);
  float cloudy = step(0.5, uWeatherType) * (1.0 - step(1.5, uWeatherType));
  cover = max(cover, cloudy * 0.65);
  // Rain/snow are coherent overcast scenes even when cloud data is missing.
  return max(cover, precipitationWeather() * 0.87);
}

vec3 getSkyColor(vec2 uv) {
  vec3 dayTop;
  vec3 dayBottom;
  if (uWeatherType < 0.5) {
    dayTop = vec3(0.31, 0.61, 0.83);
    dayBottom = vec3(0.76, 0.87, 0.94);
  } else if (uWeatherType < 1.5) {
    dayTop = vec3(0.48, 0.57, 0.67);
    dayBottom = vec3(0.70, 0.77, 0.83);
  } else if (uWeatherType < 2.5) {
    dayTop = vec3(0.40, 0.49, 0.59);
    dayBottom = vec3(0.62, 0.69, 0.76);
  } else if (uWeatherType < 3.5) {
    dayTop = vec3(0.27, 0.35, 0.45);
    dayBottom = vec3(0.47, 0.55, 0.64);
  } else if (uWeatherType < 4.5) {
    dayTop = vec3(0.47, 0.55, 0.64);
    dayBottom = vec3(0.72, 0.78, 0.84);
  } else {
    dayTop = vec3(0.38, 0.51, 0.64);
    dayBottom = vec3(0.66, 0.76, 0.84);
  }

  vec3 top = mix(vec3(0.035, 0.055, 0.095), dayTop, uIsDay);
  vec3 bottom = mix(vec3(0.10, 0.14, 0.20), dayBottom, uIsDay);
  vec3 sky = mix(bottom, top, pow(clamp(uv.y, 0.0, 1.0), 0.85));
  float clearLight = (1.0 - smoothstep(0.20, 0.70, cloudCoverage()))
                   * (1.0 - precipitationWeather());
  float horizon = 1.0 - smoothstep(0.0, 0.27, uv.y);
  // Warm light belongs only to a mostly clear daytime sky.
  return mix(sky, vec3(0.91, 0.90, 0.86), horizon * clearLight * uIsDay * 0.14);
}

vec3 renderCelestial(vec3 sky, vec2 uv) {
  float visibility = (1.0 - smoothstep(0.20, 0.70, cloudCoverage()))
                   * (1.0 - precipitationWeather());
  if (uRainIntensity > 0.1 || uSnowIntensity > 0.1) visibility = 0.0;
  if (visibility < 0.001) return sky;

  vec2 sunPos = vec2(0.78, 0.80);
  vec2 delta = (uv - sunPos) * vec2(max(uAspect, 0.1), 1.0);
  float d = length(delta);
  if (uIsDay > 0.5) {
    float core = 1.0 - smoothstep(0.010, 0.025, d);
    float glow = (1.0 - smoothstep(0.012, 0.18, d)) * 0.28
               + (1.0 - smoothstep(0.04, 0.48, d)) * 0.10;
    // Broad atmospheric shafts, restrained optical ghosts, no sharp starburst.
    float angle = atan(delta.y, delta.x);
    float shafts = pow(max(0.0, cos(angle * 5.0 + sin(uTime * 0.08) * 0.10)), 10.0)
                 * (1.0 - smoothstep(0.04, 0.58, d)) * 0.042;
    vec2 axis = vec2(0.5, 0.5) - sunPos;
    vec2 ghostDelta = (uv - (sunPos + axis * 1.45)) * vec2(max(uAspect, 0.1), 1.0);
    float ghost = (1.0 - smoothstep(0.015, 0.035, length(ghostDelta))) * 0.042;
    return mix(sky, vec3(1.0, 0.97, 0.88), clamp(core * 0.91 + glow + shafts + ghost, 0.0, 1.0) * visibility);
  }

  float moon = 1.0 - smoothstep(0.016, 0.020, d);
  vec2 cutDelta = (uv - sunPos - vec2(0.015, -0.007)) * vec2(max(uAspect, 0.1), 1.0);
  float cut = 1.0 - smoothstep(0.016, 0.020, length(cutDelta));
  float halo = (1.0 - smoothstep(0.025, 0.15, d)) * 0.075;
  sky = mix(sky, vec3(0.85, 0.89, 0.94), (moon * (1.0 - cut) * 0.83 + halo) * visibility);

  vec2 starUv = uv * max(uResolution, vec2(1.0)) / 28.0;
  vec2 starId = floor(starUv);
  float seed = hash12(starId);
  if (seed > 0.992) {
    vec2 starLocal = fract(starUv) - 0.5;
    float star = 1.0 - smoothstep(0.012, 0.050, length(starLocal));
    float twinkle = 0.75 + 0.25 * sin(uTime * 0.6 + seed * 20.0);
    sky += vec3(0.50, 0.56, 0.66) * star * twinkle * visibility;
  }
  return sky;
}

vec3 renderClouds(vec3 sky, vec2 uv) {
  float cover = cloudCoverage();
  if (cover < 0.025) return sky;

  // Both axes are measured in viewport heights before stretching horizontally.
  // The two broad, overlapping fields cost six noise samples per sky evaluation.
  vec2 p = vec2(uv.x * max(uAspect, 0.1), uv.y);
  vec2 wind = uWindDir * clamp(uWindSpeed, 0.0, 6.0);
  float farField = cloudNoise(p * vec2(1.35, 2.10) + vec2(1.2, 4.4) - wind * uTime * 0.014);
  float nearField = cloudNoise(p * vec2(2.00, 3.10) + vec2(7.1, 0.8) - wind * uTime * 0.023);
  float field = farField * 0.72 + nearField * 0.28;
  float threshold = mix(0.76, 0.25, cover);
  float softShape = smoothstep(threshold - 0.16, threshold + 0.22, field);
  float overcast = smoothstep(0.56, 0.86, cover);
  float alpha = mix(softShape * (0.20 + cover * 0.75), 0.73 + softShape * 0.22, overcast);

  float rain = clamp(uRainIntensity / 3.0, 0.0, 1.0);
  vec3 shadow = mix(vec3(0.66, 0.73, 0.80), vec3(0.54, 0.60, 0.67), overcast);
  vec3 lit = mix(vec3(0.97, 0.98, 0.98), vec3(0.77, 0.81, 0.85), overcast);
  shadow = mix(shadow, vec3(0.36, 0.43, 0.52), rain);
  lit = mix(lit, vec3(0.59, 0.65, 0.73), rain);
  shadow = mix(vec3(0.085, 0.12, 0.18), shadow, uIsDay);
  lit = mix(vec3(0.19, 0.24, 0.31), lit, uIsDay);
  // Shading is independent of the alpha edge; no bright rocky contour outlines.
  float light = clamp(0.55 + (farField - 0.5) * 2.15 + (nearField - 0.5) * 0.70 + uv.y * 0.07, 0.0, 1.0);
  vec3 cloudColor = mix(shadow, lit, light);
  return mix(sky, cloudColor, clamp(alpha, 0.0, 0.96));
}

vec3 applyAtmosphere(vec3 color, vec2 uv) {
  float fog = 1.0 - smoothstep(0.0, 0.45, uv.y);
  float cover = cloudCoverage();
  float rain = clamp(uRainIntensity / 3.0, 0.0, 1.0);
  vec3 fogDay = mix(vec3(0.86, 0.91, 0.94), vec3(0.67, 0.73, 0.79), cover);
  fogDay = mix(fogDay, vec3(0.48, 0.55, 0.63), rain);
  vec3 fogColor = mix(vec3(0.10, 0.14, 0.19), fogDay, uIsDay);
  return mix(color, fogColor, fog * (0.12 + cover * 0.10));
}

// This is also the water-lens source. It exactly matches the unobstructed sky.
vec3 sampleSkyBackground(vec2 uv) {
  uv = clamp(uv, 0.0, 1.0);
  vec3 color = getSkyColor(uv);
  color = renderCelestial(color, uv);
  color = renderClouds(color, uv);
  return applyAtmosphere(color, uv);
}

float rainStreak(vec2 uv, float density, float layer) {
  float intensity = clamp(uRainIntensity / 3.0, 0.0, 1.0);
  vec2 px = uv * max(uResolution, vec2(1.0));
  float slope = clamp(uWindDir.x * (0.035 + clamp(uWindSpeed, 0.0, 6.0) * 0.115), -0.78, 0.78);
  // +time in upward UV coordinates translates each streak downward on screen.
  vec2 moving = vec2(px.x + slope * px.y, px.y);
  moving.y += uTime * mix(210.0, 490.0, intensity) * mix(0.68, 1.30, layer);
  moving += vec2(31.7, 17.3) * layer;
  vec2 cellSize = mix(vec2(22.0, 66.0), vec2(39.0, 108.0), layer);
  vec2 id = floor(moving / cellSize);
  float random = hash12(id + layer * 53.0);
  if (random > density) return 0.0;
  vec2 local = (fract(moving / cellSize) - 0.5) * cellSize;
  local.x -= (hash12(id + vec2(8.4, 2.7)) - 0.5) * cellSize.x * 0.62;
  local.y -= (hash12(id + vec2(4.1, 9.6)) - 0.5) * cellSize.y * 0.40;
  float lengthPx = mix(7.0, 23.0, intensity) * mix(0.65, 1.65, layer)
                 * mix(0.75, 1.20, hash12(id + 100.0));
  float widthPx = mix(0.55, 1.10, layer);
  float across = 1.0 - smoothstep(widthPx * 0.30, widthPx * 0.50 + 0.75, abs(local.x));
  float along = 1.0 - smoothstep(lengthPx * 0.28, lengthPx * 0.50, abs(local.y));
  return across * along;
}

vec3 renderRain(vec3 color, vec2 uv) {
  if (uRainIntensity < 0.1) return color;
  float intensity = clamp(uRainIntensity / 3.0, 0.0, 1.0);
  float farRain = rainStreak(uv, mix(0.05, 0.70, intensity), 0.0);
  float midRain = rainStreak(uv, mix(0.025, 0.52, intensity), 0.5);
  float nearRain = rainStreak(uv, mix(0.01, 0.30, intensity), 1.0);
  float alpha = clamp(farRain * 0.15 + midRain * 0.25 + nearRain * 0.35, 0.0, 0.65);
  vec3 rainColor = mix(vec3(0.37, 0.46, 0.57), vec3(0.78, 0.86, 0.93), uIsDay);
  return mix(color, rainColor, alpha);
}

vec3 renderWaterDrops(vec3 color, vec2 uv) {
  if (uRainIntensity < 0.5) return color;
  float intensity = clamp(uRainIntensity / 3.0, 0.0, 1.0);
  float aspect = max(uAspect, 0.1);
  float pixel = 1.0 / max(uResolution.y, 1.0);
  vec2 point = uv * vec2(aspect, 1.0);
  vec3 result = color;
  float count = floor(mix(6.0, 18.0, intensity) + 0.5);
  float wind = clamp(uWindSpeed, 0.0, 6.0);
  float driftRatio = uWindDir.x * wind * 0.085 * aspect;

  // A fixed, small bound remains valid for strict GLSL ES 1.00 compilers.
  for (int i = 0; i < 18; i++) {
    if (float(i) >= count) break;
    vec2 seed = vec2(float(i) * 7.31 + 1.7, float(i) * 13.17 + 5.9);
    vec2 base = hash22(seed);
    float sizeRandom = hash12(seed + 7.7);
    float size = mix(0.004, 0.016, sizeRandom);
    if (sizeRandom > 0.88) size = mix(0.017, 0.024, (sizeRandom - 0.88) / 0.12);
    float stretch = 1.0 + smoothstep(0.50, 0.95, sizeRandom) * intensity * 0.36;
    float fallSpeed = mix(0.004, 0.075, sizeRandom * sizeRandom) * mix(0.65, 1.35, intensity);
    float y = mod(base.y - uTime * fallSpeed + 0.18, 1.36) - 0.18;
    float x = mod(base.x + uTime * fallSpeed * uWindDir.x * wind * 0.085 + 1.0, 1.0);
    vec2 delta = point - vec2(x * aspect, y);
    float trailLength = size * mix(2.0, 5.5, intensity) * smoothstep(0.35, 0.95, sizeRandom);

    // Reject only outside the UNION of bead and trail; the old circular reject
    // clipped almost the entire slide mark before it could be calculated.
    float boundX = size + trailLength * abs(driftRatio) + pixel;
    if (abs(delta.x) > boundX || delta.y < -size * stretch - pixel
        || delta.y > size * stretch + trailLength + pixel) continue;

    if (trailLength > pixel) {
      float trailY = (delta.y - size * stretch * 0.45) / trailLength;
      if (trailY > 0.0 && trailY < 1.0) {
        float trailX = delta.x + delta.y * driftRatio;
        float trailWidth = size * 0.16 * (1.0 - trailY * 0.65);
        float trailMask = (1.0 - smoothstep(trailWidth * 0.45, trailWidth + pixel, abs(trailX)))
                        * (1.0 - smoothstep(0.55, 1.0, trailY));
        if (trailMask > 0.01) {
          vec2 offset = vec2(trailX / max(trailWidth, pixel) * size * 0.10 / aspect, 0.0);
          vec3 trailColor = sampleSkyBackground(uv - offset) * 1.025;
          result = mix(result, trailColor, trailMask * intensity * 0.24);
        }
      }
    }

    vec2 cap = delta / vec2(size, size * stretch);
    float radius2 = dot(cap, cap);
    if (radius2 < 1.0) {
      float radius = sqrt(radius2);
      float body = 1.0 - smoothstep(0.85, 1.0, radius);
      float nz = sqrt(max(1.0 - radius2, 0.001));
      vec3 normal = normalize(vec3(cap.x, cap.y / stretch, nz));
      // The incident ray travels into the surface, opposite the viewer vector.
      vec3 incoming = vec3(0.0, 0.0, -1.0);
      vec3 lens = refract(incoming, normal, 0.75);
      vec2 offset = lens.xy * size * 2.8 * vec2(1.0 / aspect, 1.0);
      vec3 dropColor = sampleSkyBackground(uv + offset);
      float fresnel = pow(1.0 - nz, 3.0);
      vec3 lightDir = normalize(vec3(-0.35, 0.60, 0.80));
      float specular = pow(max(0.0, dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0))), 48.0);
      specular *= 1.0 - smoothstep(0.60, 0.95, radius);
      dropColor *= 1.0 - fresnel * 0.19;
      // Thin glass edges and restrained glints; never an opaque white bubble.
      dropColor = mix(dropColor, vec3(0.86, 0.91, 0.96), fresnel * 0.035);
      dropColor = mix(dropColor, vec3(0.95, 0.97, 0.99), specular * mix(0.24, 0.55, uIsDay));
      result = mix(result, dropColor, body * 0.92);
    }
  }
  return result;
}

float snowFlake(vec2 uv, float scale, float speed, float sizeBase, float wobbleAmount) {
  vec2 p = uv * vec2(max(uAspect, 0.1), 1.0);
  float wind = clamp(uWindSpeed, 0.0, 6.0);
  p.x += sin(uv.y * 3.0 + uTime * 0.9) * wobbleAmount * (0.25 + wind * 0.08);
  p.x -= uTime * uWindDir.x * speed * wind * 0.016;
  p *= scale;
  p.y += uTime * speed;
  vec2 id = floor(p);
  float seed = hash12(id + scale);
  if (seed > clamp(uSnowIntensity, 0.0, 3.0) * 0.28) return 0.0;
  vec2 local = fract(p) - 0.5;
  local -= (hash22(id + vec2(2.9, 6.1)) - 0.5) * 0.38;
  float size = sizeBase * mix(0.65, 1.35, seed);
  // Subpixel crystals are soft discs; six-arm geometry is wasted at this scale.
  return 1.0 - smoothstep(size * 0.10, size, length(local));
}

vec3 renderSnow(vec3 color, vec2 uv) {
  if (uSnowIntensity < 0.1) return color;
  float farSnow = snowFlake(uv, 60.0, 0.35, 0.065, 0.025);
  float midSnow = snowFlake(uv + vec2(0.2, 0.4), 30.0, 0.60, 0.095, 0.045);
  float nearSnow = snowFlake(uv + vec2(0.7, 0.1), 12.0, 0.85, 0.115, 0.070);
  float alpha = clamp(farSnow * 0.34 + midSnow * 0.57 + nearSnow * 0.78, 0.0, 0.90);
  return mix(color, mix(vec3(0.72, 0.80, 0.88), vec3(0.97, 0.98, 1.0), uIsDay), alpha);
}

void main() {
  vec3 color = sampleSkyBackground(vUv);
  color = renderRain(color, vUv);
  color = renderSnow(color, vUv);
  color = renderWaterDrops(color, vUv);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
