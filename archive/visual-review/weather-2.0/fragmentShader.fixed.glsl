
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAspect;       // width / height
uniform vec2 uWindDir;       // 标准化风向向量
uniform float uWindSpeed;    // 风速因子 (0.5 ~ 6.0)
uniform float uCloudCover;   // 云量 0-100
uniform float uRainIntensity; // 0-3
uniform float uSnowIntensity; // 0-3
uniform float uIsDay;        // 0 or 1
uniform float uWeatherType;  // 0=clear,1=cloudy,2=light_rain,3=heavy_rain,4=snow,5=windy
uniform float uTimeOfDay;    // 0-1

#define PI 3.14159265359

// ========== 工具函数 ==========
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec2((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p, int octaves) {
  float d = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    d += amp * noise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return d;
}

// 柔化的云形状
float cloudShape(vec2 p, float scale, float speed, float detail) {
  vec2 drift = uWindDir * uTime * speed * uWindSpeed * 0.3;
  float n = fbm(p * scale + drift, 5);
  float threshold = mix(0.35, 0.55, detail);
  return smoothstep(threshold, threshold + 0.15, n);
}

// ========== 天空颜色（接受 uv 参数，用于水珠折射重采样）==========
vec3 getSkyColor(vec2 uv) {
  vec3 topColor, bottomColor;

  vec3 dayTop, dayBottom;
  vec3 nightTop, nightBottom;

  if (uWeatherType < 1.5) { // clear
    dayTop = vec3(0.45, 0.72, 0.89);
    dayBottom = vec3(0.82, 0.92, 0.98);
  } else if (uWeatherType < 2.5) { // cloudy / light_rain-ish
    dayTop = vec3(0.52, 0.60, 0.70);
    dayBottom = vec3(0.72, 0.78, 0.85);
  } else if (uWeatherType < 4.5) { // heavy_rain / snow
    dayTop = vec3(0.35, 0.42, 0.52);
    dayBottom = vec3(0.55, 0.62, 0.70);
  } else { // windy
    dayTop = vec3(0.50, 0.58, 0.68);
    dayBottom = vec3(0.70, 0.76, 0.83);
  }

  nightTop = vec3(0.04, 0.07, 0.12);
  nightBottom = vec3(0.10, 0.15, 0.22);

  topColor = mix(nightTop, dayTop, uIsDay);
  bottomColor = mix(nightBottom, dayBottom, uIsDay);

  vec3 sky = mix(bottomColor, topColor, pow(uv.y, 0.85));

  // 地平线附近的柔和暖光
  float horizonGlow = 1.0 - smoothstep(0.0, 0.3, uv.y);
  vec3 warmGlow = uIsDay > 0.5
    ? vec3(0.95, 0.92, 0.85)
    : vec3(0.15, 0.18, 0.25);
  sky = mix(sky, warmGlow, horizonGlow * 0.35);

  return sky;
}

// ========== 太阳/月亮 + 光晕（接受 uv 参数，aspect 校正距离）==========
vec3 renderCelestial(vec3 sky, vec2 uv) {
  vec2 sunPos = vec2(0.75, 0.25);
  // aspect 校正：x 方向按比例缩放，保持圆形
  vec2 delta = uv - sunPos;
  delta.x *= uAspect;
  float dist = length(delta);

  if (uIsDay > 0.5) {
    // 太阳本体
    float sunCore = 1.0 - smoothstep(0.0, 0.06, dist);
    // 柔和光晕（多层）
    float glow1 = (1.0 - smoothstep(0.0, 0.4, dist)) * 0.25;
    float glow2 = (1.0 - smoothstep(0.0, 0.8, dist)) * 0.12;
    // 光芒射线（柔和）
    float rays = 0.0;
    float angle = atan(delta.y, delta.x);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * PI / 4.0 + uTime * 0.02;
      float rayWidth = 0.08;
      float angleDiff = abs(mod(angle - a + PI, PI * 2.0) - PI);
      float rayStrength = 1.0 - smoothstep(0.0, rayWidth, angleDiff);
      rays += rayStrength * (1.0 - smoothstep(0.0, 0.5, dist)) * 0.08;
    }

    vec3 sunColor = vec3(1.0, 0.96, 0.82);
    float totalGlow = glow1 + glow2 + rays;
    sky = mix(sky, sunColor, sunCore * 0.95 + totalGlow);
  } else {
    // 月亮
    float moonCore = 1.0 - smoothstep(0.0, 0.05, dist);
    float moonGlow = (1.0 - smoothstep(0.0, 0.25, dist)) * 0.15;
    // 月牙形状（偏移遮罩）
    vec2 moonOffset = sunPos + vec2(0.015, -0.008);
    vec2 moonDelta = uv - moonOffset;
    moonDelta.x *= uAspect;
    float moonDist = length(moonDelta);
    float moonMask = 1.0 - smoothstep(0.042, 0.048, moonDist);
    float moonShape = moonCore * (1.0 - moonMask * 0.7);

    vec3 moonColor = vec3(0.92, 0.94, 0.98);
    sky = mix(sky, moonColor, moonShape * 0.85 + moonGlow);

    // 星星（稀疏）
    float starField = 0.0;
    vec2 starUv = uv * 120.0;
    vec2 starId = floor(starUv);
    float starHash = hash12(starId);
    if (starHash > 0.985 && uWeatherType < 1.5) {
      vec2 starFract = fract(starUv) - 0.5;
      float starSize = 0.05 + starHash * 0.05;
      float star = 1.0 - smoothstep(0.0, starSize, length(starFract));
      float twinkle = 0.5 + 0.5 * sin(uTime * 2.0 + starHash * 20.0);
      starField = star * twinkle * 0.8;
    }
    sky += vec3(1.0) * starField;
  }

  return sky;
}

// ========== 云层渲染（接受 uv 参数）==========
vec3 renderClouds(vec3 sky, vec2 uv) {
  float cover = uCloudCover * 0.01;
  if (cover < 0.02 && uWeatherType < 0.5) {
    float wispy = cloudShape(uv, 1.5, 0.08, 0.75);
    wispy *= 0.15;
    vec3 cloudColor = uIsDay > 0.5 ? vec3(1.0, 0.98, 0.95) : vec3(0.6, 0.65, 0.72);
    return mix(sky, cloudColor, wispy);
  }

  float cloudFar = cloudShape(uv, 1.2, 0.05, 0.55 - cover * 0.2);
  cloudFar *= 0.5;

  float cloudMid = cloudShape(uv * 1.5 + vec2(5.2, 3.1), 2.0, 0.1, 0.5 - cover * 0.15);
  cloudMid *= 0.75;

  float cloudNear = cloudShape(uv * 2.5 + vec2(2.8, 7.4), 3.5, 0.18, 0.45);
  cloudNear *= 0.9;

  float totalCloud = cloudFar + cloudMid * 0.6 + cloudNear * 0.4;
  totalCloud = clamp(totalCloud * cover * 1.2, 0.0, 0.95);

  vec3 cloudLit, cloudShadow;
  if (uIsDay > 0.5) {
    cloudLit = vec3(1.0, 0.99, 0.97);
    cloudShadow = vec3(0.65, 0.70, 0.78);
  } else {
    cloudLit = vec3(0.45, 0.50, 0.58);
    cloudShadow = vec3(0.25, 0.30, 0.38);
  }

  vec3 cloudColor = mix(cloudShadow, cloudLit, smoothstep(0.1, 0.7, totalCloud));

  return mix(sky, cloudColor, totalCloud);
}

// ========== 雨 ==========
float rainStreak(vec2 uv, float density, float tilt, float speedMul) {
  vec2 tilted = uv;
  tilted.x += tilted.y * tilt * uWindDir.x * uWindSpeed * 0.5;

  tilted *= vec2(80.0, 250.0);
  tilted.y += uTime * 30.0 * speedMul * uWindSpeed;
  tilted.x += uTime * uWindDir.x * 8.0 * uWindSpeed;

  vec2 grid = fract(tilted) - 0.5;
  vec2 id = floor(tilted);

  float r = hash12(id);
  if (r > density) return 0.0;

  // 雨丝形状：细长（smoothstep 规范化：edge0 < edge1）
  float streak = (1.0 - smoothstep(0.0, 0.04, abs(grid.x))) * (1.0 - smoothstep(0.0, 0.5, abs(grid.y)));
  float lengthVar = mix(0.3, 1.0, hash12(id + 100.0));
  streak *= 1.0 - smoothstep(0.0, 0.5 * lengthVar, abs(grid.y));

  return streak;
}

vec3 renderRain(vec3 color, vec2 uv) {
  if (uRainIntensity < 0.1) return color;

  float intensity = uRainIntensity / 3.0;

  float rainFar = rainStreak(uv, intensity * 0.5, 0.1, 0.7);
  float farMask = rainFar * 0.25;

  float rainMid = rainStreak(uv * 0.7 + vec2(0.3, 0.1), intensity * 0.35, 0.15, 1.0);
  float midMask = rainMid * 0.4;

  float rainNear = rainStreak(uv * 0.4 + vec2(0.1, 0.5), intensity * 0.2, 0.2, 1.3);
  float nearMask = rainNear * 0.55;

  float totalRain = farMask + midMask + nearMask;

  vec3 rainColor = uIsDay > 0.5
    ? vec3(0.85, 0.92, 1.0)
    : vec3(0.4, 0.5, 0.6);

  return mix(color, rainColor, totalRain);
}

// ========== 采样完整背景天空（水珠折射用）==========
vec3 sampleSkyBackground(vec2 uv) {
  // 裁剪到合理范围，防止采样越界产生硬边
  uv = clamp(uv, 0.0, 1.0);
  vec3 col = getSkyColor(uv);
  col = renderCelestial(col, uv);
  col = renderClouds(col, uv);
  return col;
}

// ========== 玻璃水珠（真实折射重采样）==========
vec3 renderWaterDrops(vec3 color, vec2 uv) {
  if (uRainIntensity < 0.5) return color;

  float intensity = uRainIntensity / 3.0;
  vec3 result = color;

  // 水珠数量：小雨约 8 个，大雨约 28 个
  int dropCount = int(intensity * 28.0 + 4.0);
  if (dropCount > 30) dropCount = 30;

  // aspect 校正的 UV（x 方向缩放，保持水珠为圆形）
  vec2 aspectUv = uv;
  aspectUv.x *= uAspect;

  for (int i = 0; i < 35; i++) {
    if (i >= dropCount) break;

    vec2 seed = vec2(float(i) * 7.31 + 1.7, float(i) * 13.17 + 5.9);
    vec2 basePos = hash22(seed);

    // 下落动画
    float fallSpeed = mix(0.03, 0.12, hash12(seed + 3.3)) * intensity * 2.0;
    float yPos = mod(basePos.y + uTime * fallSpeed * uWindSpeed, 1.1) - 0.05;
    float xPos = basePos.x + uTime * fallSpeed * 0.3 * uWindDir.x * uWindSpeed;
    xPos = mod(xPos + 1.0, 1.0);

    // aspect 校正后的水珠位置
    vec2 dropPos = vec2(xPos, yPos);
    vec2 dropPosAspect = dropPos;
    dropPosAspect.x *= uAspect;

    vec2 delta = aspectUv - dropPosAspect;
    float size = mix(0.015, 0.05, hash12(seed + 7.7));

    float dist = length(delta);
    if (dist > size * 1.4) continue;

    // 球冠形状：r^2 = R^2 - (z - d)^2，这里近似半球
    // dropBody 为水珠不透明度（边缘柔和过渡）
    float dropBody = 1.0 - smoothstep(size * 0.85, size, dist);
    float dropInner = 1.0 - smoothstep(0.0, size * 0.7, dist);

    // 球冠法线近似（半球）：normal.z = sqrt(1 - (dist/size)^2)
    float nd = clamp(dist / size, 0.0, 1.0);
    float nz = sqrt(1.0 - nd * nd);
    vec3 normal = normalize(vec3(delta / size, nz));

    // 折射（空气→水，IOR = 1/1.33）
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 refractDir = refract(viewDir, normal, 0.75);

    // 折射偏移量（以 uv 空间衡量），强度按水珠大小缩放
    vec2 refractOffset = refractDir.xy * size * 1.5;
    // 偏移施加在原始 uv 空间（带 aspect 还原）
    vec2 refractedUv = uv + refractOffset * vec2(1.0 / uAspect, 1.0);

    // 用折射后的 UV 重新采样背景
    vec3 refractedColor = sampleSkyBackground(refractedUv);

    // 菲涅尔边缘（掠射角反射更强，显得更亮）
    float fresnel = pow(1.0 - nz, 3.0);

    // 高光（左上方光源）
    vec3 lightDir = normalize(vec3(-0.35, 0.6, 0.8));
    float specular = pow(max(0.0, dot(reflect(-lightDir, normal), viewDir)), 32.0);
    // 限制高光只在水珠主体内
    specular *= dropInner;

    // 边缘亮边（全内反射/菲涅尔）
    float rim = (1.0 - dropBody) * 0.0;
    float edgeBright = fresnel * 0.3 * dropBody;

    // 合成水珠颜色：折射背景 + 高光 + 菲涅尔边缘
    vec3 dropColor = refractedColor;
    // 轻微提亮/调色，模拟玻璃上的水珠
    dropColor = mix(dropColor, dropColor * 1.08, dropBody * 0.15);
    // 高光
    dropColor = mix(dropColor, vec3(1.0), specular * 0.9);
    // 菲涅尔边缘
    dropColor = mix(dropColor, vec3(0.95, 0.97, 1.0), edgeBright);

    result = mix(result, dropColor, dropBody * 0.92 + specular * 0.5);

    // 水痕（滑落路径残留）
    float trailLength = size * mix(2.5, 6.0, intensity);
    float trailWidth = size * 0.22;
    vec2 trailPos = vec2(dropPosAspect.x, dropPosAspect.y + trailLength * 0.5);
    vec2 trailDelta = aspectUv - trailPos;
    float trailDist = abs(trailDelta.x);
    float trailY = trailDelta.y / trailLength;
    if (trailY > 0.0 && trailY < 1.0 && trailDist < trailWidth) {
      float fadeIn = smoothstep(0.0, 0.2, trailY);
      float fadeOut = 1.0 - smoothstep(0.7, 1.0, trailY);
      // 水痕也有轻微折射感
      float trailStrength = (1.0 - trailDist / trailWidth) * fadeIn * fadeOut * 0.18 * intensity;
      // 水痕处做极轻微的颜色扭曲
      vec2 trailRefractUv = uv + vec2(0.0, trailY * 0.002);
      vec3 trailColor = sampleSkyBackground(trailRefractUv);
      result = mix(result, trailColor * 1.05, trailStrength);
    }
  }

  return result;
}

// ========== 雪 ==========
float snowFlake(vec2 uv, float scale, float speed, float sizeBase, float wobbleAmount) {
  vec2 shifted = uv;
  shifted.x += sin(uv.y * 3.0 + uTime * 1.5) * wobbleAmount * uWindSpeed * 0.1;
  shifted.x += uTime * uWindDir.x * speed * 0.2 * uWindSpeed;

  shifted *= vec2(scale * 0.6, scale);
  shifted.y += uTime * speed * uWindSpeed;

  vec2 grid = fract(shifted) - 0.5;
  vec2 id = floor(shifted);

  float r = hash12(id);
  if (r > uSnowIntensity * 0.28) return 0.0;

  float size = sizeBase * mix(0.5, 1.5, r);

  float flake = 1.0 - smoothstep(0.0, size, length(grid));

  float angle = atan(grid.y, grid.x);
  float arms = 0.0;
  for (int j = 0; j < 6; j++) {
    float a = float(j) * PI / 3.0;
    float angleDiff = abs(mod(angle - a + PI, PI * 2.0) - PI);
    arms += (1.0 - smoothstep(0.0, 0.15, angleDiff)) * 0.3;
  }
  flake += arms * flake * 0.5;

  return flake;
}

vec3 renderSnow(vec3 color, vec2 uv) {
  if (uSnowIntensity < 0.1) return color;

  float snowFar = snowFlake(uv, 60.0, 0.3, 0.04, 0.02);
  float farMask = snowFar * 0.35;

  float snowMid = snowFlake(uv * 0.6 + vec2(0.2, 0.4), 30.0, 0.5, 0.07, 0.04);
  float midMask = snowMid * 0.55;

  float snowNear = snowFlake(uv * 0.3 + vec2(0.7, 0.1), 12.0, 0.8, 0.12, 0.08);
  float nearMask = smoothstep(0.0, 1.0, snowNear) * 0.7;

  float totalSnow = farMask + midMask + nearMask;

  vec3 snowColor = vec3(1.0, 1.0, 1.0);

  return mix(color, snowColor, totalSnow);
}

// ========== 大气/雾效 ==========
vec3 applyAtmosphere(vec3 color, vec2 uv) {
  float fogAmount = 1.0 - smoothstep(0.0, 0.4, uv.y);

  vec3 fogColor;
  if (uIsDay > 0.5) {
    if (uWeatherType < 1.5) {
      fogColor = vec3(0.92, 0.96, 0.99);
    } else if (uWeatherType < 3.5) {
      fogColor = vec3(0.75, 0.80, 0.86);
    } else {
      fogColor = vec3(0.85, 0.88, 0.92);
    }
  } else {
    fogColor = vec3(0.1, 0.13, 0.18);
  }

  float fogStrength = 0.15 + uCloudCover * 0.003;
  return mix(color, fogColor, fogAmount * fogStrength);
}

// ========== 主函数 ==========
void main() {
  vec3 color = getSkyColor(vUv);
  color = renderCelestial(color, vUv);
  color = renderClouds(color, vUv);
  color = applyAtmosphere(color, vUv);
  color = renderRain(color, vUv);
  color = renderSnow(color, vUv);
  color = renderWaterDrops(color, vUv);

  gl_FragColor = vec4(color, 1.0);
}
