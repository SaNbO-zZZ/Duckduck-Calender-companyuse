
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uWindDir;      // 标准化风向向量
uniform float uWindSpeed;   // 风速因子 (0.5 ~ 6.0)
uniform float uCloudCover;  // 云量 0-100
uniform float uRainIntensity; // 0-3
uniform float uSnowIntensity; // 0-3
uniform float uIsDay;       // 0 or 1
uniform float uWeatherType; // 0=clear,1=cloudy,2=light_rain,3=heavy_rain,4=snow,5=windy
uniform float uTimeOfDay;   // 0-1

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

// 湍流噪声
float turbulence(vec2 p, int octaves) {
  float d = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    d += amp * abs(noise(p * freq) * 2.0 - 1.0);
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

// ========== 天空颜色 ==========
vec3 getSkyColor() {
  vec3 topColor, bottomColor;
  
  // 白天基础色
  vec3 dayTop, dayBottom;
  vec3 nightTop, nightBottom;
  
  if (uWeatherType < 1.5) { // clear
    dayTop = vec3(0.45, 0.72, 0.89);     // 清透暖蓝
    dayBottom = vec3(0.82, 0.92, 0.98);  // 浅蓝白
  } else if (uWeatherType < 2.5) { // cloudy / light_rain-ish
    dayTop = vec3(0.52, 0.60, 0.70);     // 灰蓝
    dayBottom = vec3(0.72, 0.78, 0.85);  // 浅灰
  } else if (uWeatherType < 4.5) { // heavy_rain / snow
    dayTop = vec3(0.35, 0.42, 0.52);     // 深灰蓝
    dayBottom = vec3(0.55, 0.62, 0.70);  // 中灰
  } else { // windy
    dayTop = vec3(0.50, 0.58, 0.68);
    dayBottom = vec3(0.70, 0.76, 0.83);
  }
  
  nightTop = vec3(0.04, 0.07, 0.12);     // 深夜蓝
  nightBottom = vec3(0.10, 0.15, 0.22);  // 暗蓝灰
  
  // 混合昼夜
  topColor = mix(nightTop, dayTop, uIsDay);
  bottomColor = mix(nightBottom, dayBottom, uIsDay);
  
  // 晨昏色调（仅白天模式边缘）
  float dawnDusk = 0.0;
  if (uIsDay > 0.5) {
    dawnDusk = smoothstep(0.2, 0.35, uTimeOfDay) * (1.0 - smoothstep(0.65, 0.8, uTimeOfDay));
    dawnDusk = 0.0; // 简化，不做复杂晨昏
  }
  
  vec3 sky = mix(bottomColor, topColor, pow(vUv.y, 0.85));
  
  // 地平线附近的柔和暖光
  float horizonGlow = smoothstep(0.3, 0.0, vUv.y);
  vec3 warmGlow = uIsDay > 0.5 
    ? vec3(0.95, 0.92, 0.85)  // 日间暖白
    : vec3(0.15, 0.18, 0.25); // 夜间冷白
  sky = mix(sky, warmGlow, horizonGlow * 0.35);
  
  return sky;
}

// ========== 太阳/月亮 + 光晕 ==========
vec3 renderCelestial(vec3 sky) {
  vec2 sunPos = vec2(0.75, 0.25);
  float dist = length(vUv - sunPos);
  
  if (uIsDay > 0.5) {
    // 太阳本体
    float sunCore = smoothstep(0.06, 0.0, dist);
    // 柔和光晕（多层）
    float glow1 = smoothstep(0.4, 0.0, dist) * 0.25;
    float glow2 = smoothstep(0.8, 0.0, dist) * 0.12;
    // 光芒射线（柔和）
    float rays = 0.0;
    float angle = atan(vUv.y - sunPos.y, vUv.x - sunPos.x);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * PI / 4.0 + uTime * 0.02;
      float rayWidth = 0.08;
      float rayStrength = smoothstep(rayWidth, 0.0, abs(mod(angle - a + PI, PI * 2.0) - PI));
      rays += rayStrength * smoothstep(0.5, 0.0, dist) * 0.08;
    }
    
    vec3 sunColor = vec3(1.0, 0.96, 0.82); // 暖白金
    vec3 glowColor = vec3(1.0, 0.92, 0.75);
    
    float totalGlow = glow1 + glow2 + rays;
    sky = mix(sky, sunColor, sunCore * 0.95 + totalGlow);
  } else {
    // 月亮
    float moonCore = smoothstep(0.05, 0.0, dist);
    float moonGlow = smoothstep(0.25, 0.0, dist) * 0.15;
    // 月牙形状（偏移遮罩）
    vec2 moonOffset = sunPos + vec2(0.015, -0.008);
    float moonMask = smoothstep(0.048, 0.042, length(vUv - moonOffset));
    float moonShape = moonCore * (1.0 - moonMask * 0.7);
    
    vec3 moonColor = vec3(0.92, 0.94, 0.98);
    sky = mix(sky, moonColor, moonShape * 0.85 + moonGlow);
    
    // 星星（稀疏）
    float starField = 0.0;
    vec2 starUv = vUv * 120.0;
    vec2 starId = floor(starUv);
    float starHash = hash12(starId);
    if (starHash > 0.985 && uWeatherType < 1.5) {
      vec2 starFract = fract(starUv) - 0.5;
      float starSize = 0.05 + starHash * 0.05;
      float star = smoothstep(starSize, 0.0, length(starFract));
      float twinkle = 0.5 + 0.5 * sin(uTime * 2.0 + starHash * 20.0);
      starField = star * twinkle * 0.8;
    }
    sky += vec3(1.0) * starField;
  }
  
  return sky;
}

// ========== 云层渲染 ==========
vec3 renderClouds(vec3 sky) {
  float cover = uCloudCover * 0.01;
  if (cover < 0.02 && uWeatherType < 0.5) {
    // 晴天只有极少量高空絮状云
    float wispy = cloudShape(vUv, 1.5, 0.08, 0.75);
    wispy *= 0.15;
    vec3 cloudColor = uIsDay > 0.5 ? vec3(1.0, 0.98, 0.95) : vec3(0.6, 0.65, 0.72);
    return mix(sky, cloudColor, wispy);
  }
  
  // 远层云（慢、大尺度、淡）
  float cloudFar = cloudShape(vUv, 1.2, 0.05, 0.55 - cover * 0.2);
  cloudFar *= 0.5;
  
  // 中层云（中等速度）
  float cloudMid = cloudShape(vUv * 1.5 + vec2(5.2, 3.1), 2.0, 0.1, 0.5 - cover * 0.15);
  cloudMid *= 0.75;
  
  // 近层云（快、小尺度、浓）
  float cloudNear = cloudShape(vUv * 2.5 + vec2(2.8, 7.4), 3.5, 0.18, 0.45);
  cloudNear *= 0.9;
  
  // 总云量
  float totalCloud = cloudFar + cloudMid * 0.6 + cloudNear * 0.4;
  totalCloud = clamp(totalCloud * cover * 1.2, 0.0, 0.95);
  
  // 云的颜色（受光照影响）
  vec3 cloudLit, cloudShadow;
  if (uIsDay > 0.5) {
    cloudLit = vec3(1.0, 0.99, 0.97);      // 亮部暖白
    cloudShadow = vec3(0.65, 0.70, 0.78);  // 暗部灰蓝
  } else {
    cloudLit = vec3(0.45, 0.50, 0.58);
    cloudShadow = vec3(0.25, 0.30, 0.38);
  }
  
  // 基于云厚度混合亮暗
  vec3 cloudColor = mix(cloudShadow, cloudLit, smoothstep(0.1, 0.7, totalCloud));
  
  return mix(sky, cloudColor, totalCloud);
}

// ========== 雨 ==========
float rainStreak(vec2 uv, float density, float tilt, float speedMul) {
  // 倾斜坐标
  vec2 tilted = uv;
  tilted.x += tilted.y * tilt * uWindDir.x * uWindSpeed * 0.5;
  
  tilted *= vec2(80.0, 250.0);
  tilted.y += uTime * 30.0 * speedMul * uWindSpeed;
  tilted.x += uTime * uWindDir.x * 8.0 * uWindSpeed;
  
  vec2 grid = fract(tilted) - 0.5;
  vec2 id = floor(tilted);
  
  float r = hash12(id);
  if (r > density) return 0.0;
  
  // 雨丝形状：细长
  float streak = smoothstep(0.04, 0.0, abs(grid.x)) * smoothstep(0.5, 0.0, abs(grid.y));
  // 随机长度
  float lengthVar = mix(0.3, 1.0, hash12(id + 100.0));
  streak *= smoothstep(0.5 * lengthVar, 0.0, abs(grid.y));
  
  return streak;
}

vec3 renderRain(vec3 color) {
  if (uRainIntensity < 0.1) return color;
  
  float intensity = uRainIntensity / 3.0;
  
  // 远景雨（细、密、淡）
  float rainFar = rainStreak(vUv, intensity * 0.5, 0.1, 0.7);
  float farMask = rainFar * 0.25;
  
  // 中景雨
  float rainMid = rainStreak(vUv * 0.7 + vec2(0.3, 0.1), intensity * 0.35, 0.15, 1.0);
  float midMask = rainMid * 0.4;
  
  // 近景雨（粗、稀、亮）
  float rainNear = rainStreak(vUv * 0.4 + vec2(0.1, 0.5), intensity * 0.2, 0.2, 1.3);
  float nearMask = rainNear * 0.55;
  
  float totalRain = farMask + midMask + nearMask;
  
  // 雨的颜色：亮白偏蓝
  vec3 rainColor = uIsDay > 0.5 
    ? vec3(0.85, 0.92, 1.0) 
    : vec3(0.4, 0.5, 0.6);
  
  return mix(color, rainColor, totalRain);
}

// ========== 玻璃水珠 ==========
vec3 renderWaterDrops(vec3 color) {
  if (uRainIntensity < 0.5) return color;
  
  float intensity = uRainIntensity / 3.0;
  vec3 result = color;
  
  // 生成多颗水珠
  int dropCount = int(intensity * 25.0);
  dropCount = min(dropCount, 30);
  
  for (int i = 0; i < 35; i++) {
    if (i >= dropCount) break;
    
    // 水珠位置（伪随机，缓慢下落）
    vec2 seed = vec2(float(i) * 7.31 + 1.7, float(i) * 13.17 + 5.9);
    vec2 basePos = hash22(seed);
    
    // 下落动画
    float fallSpeed = mix(0.03, 0.12, hash12(seed + 3.3)) * intensity * 2.0;
    float yPos = mod(basePos.y + uTime * fallSpeed * uWindSpeed, 1.1) - 0.05;
    float xPos = basePos.x + uTime * fallSpeed * 0.3 * uWindDir.x * uWindSpeed;
    xPos = mod(xPos + 1.0, 1.0);
    
    vec2 dropPos = vec2(xPos, yPos);
    vec2 delta = vUv - dropPos;
    
    // 水珠大小
    float size = mix(0.01, 0.04, hash12(seed + 7.7));
    
    float dist = length(delta);
    if (dist > size * 1.5) continue;
    
    // 水珠主体（透镜效果）
    float dropBody = smoothstep(size, size * 0.1, dist);
    
    // 高光（左上）
    vec2 highlightDir = normalize(vec2(-0.4, -0.9));
    float highlight = max(0.0, dot(normalize(delta + vec2(0.0001)), highlightDir));
    highlight = pow(highlight, 8.0) * smoothstep(size, size * 0.3, dist);
    
    // 折射扭曲采样（简化：用偏移模拟）
    vec2 refractOffset = delta * 0.3 * dropBody;
    // 不做实际采样，用颜色变化模拟
    
    // 水珠颜色：亮部高光 + 暗部边缘
    vec3 dropColor = mix(color, vec3(1.0), highlight * 0.9);
    dropColor = mix(dropColor, color * 0.85, dropBody * 0.15 * (1.0 - highlight));
    
    result = mix(result, dropColor, dropBody * 0.85 + highlight * 0.5);
    
    // 水痕（短暂轨迹）
    float trailLength = size * mix(2.0, 5.0, intensity);
    float trailWidth = size * 0.25;
    vec2 trailDelta = vUv - vec2(xPos, yPos + trailLength * 0.5);
    float trailDist = abs(trailDelta.x);
    float trailY = trailDelta.y / trailLength;
    if (trailY > 0.0 && trailY < 1.0 && trailDist < trailWidth) {
      float fadeIn = smoothstep(0.0, 0.2, trailY);
      float fadeOut = 1.0 - smoothstep(0.7, 1.0, trailY);
      float trail = (1.0 - trailDist / trailWidth) * fadeIn * fadeOut * 0.15 * intensity;
      result = mix(result, vec3(0.9, 0.95, 1.0), trail);
    }
  }
  
  return result;
}

// ========== 雪 ==========
float snowFlake(vec2 uv, float scale, float speed, float sizeBase, float wobbleAmount) {
  vec2 shifted = uv;
  // 水平摆动
  shifted.x += sin(uv.y * 3.0 + uTime * 1.5) * wobbleAmount * uWindSpeed * 0.1;
  shifted.x += uTime * uWindDir.x * speed * 0.2 * uWindSpeed;
  
  shifted *= vec2(scale * 0.6, scale);
  shifted.y += uTime * speed * uWindSpeed;
  
  vec2 grid = fract(shifted) - 0.5;
  vec2 id = floor(shifted);
  
  float r = hash12(id);
  if (r > uSnowIntensity * 0.28) return 0.0;
  
  // 随机大小
  float size = sizeBase * mix(0.5, 1.5, r);
  
  // 雪花形状（柔圆）
  float flake = smoothstep(size, 0.0, length(grid));
  
  // 简单的六出形状
  float angle = atan(grid.y, grid.x);
  float arms = 0.0;
  for (int j = 0; j < 6; j++) {
    float a = float(j) * PI / 3.0;
    arms += smoothstep(0.15, 0.0, abs(mod(angle - a + PI, PI * 2.0) - PI)) * 0.3;
  }
  flake += arms * flake * 0.5;
  
  return flake;
}

vec3 renderSnow(vec3 color) {
  if (uSnowIntensity < 0.1) return color;
  
  // 远景雪（小、多、清晰）
  float snowFar = snowFlake(vUv, 60.0, 0.3, 0.04, 0.02);
  float farMask = snowFar * 0.35;
  
  // 中景雪
  float snowMid = snowFlake(vUv * 0.6 + vec2(0.2, 0.4), 30.0, 0.5, 0.07, 0.04);
  float midMask = snowMid * 0.55;
  
  // 近景雪（大、少、模糊散焦）
  float snowNear = snowFlake(vUv * 0.3 + vec2(0.7, 0.1), 12.0, 0.8, 0.12, 0.08);
  // 散焦效果（模糊边缘）
  float nearMask = smoothstep(0.0, 1.0, snowNear) * 0.7;
  
  float totalSnow = farMask + midMask + nearMask;
  
  vec3 snowColor = vec3(1.0, 1.0, 1.0);
  
  return mix(color, snowColor, totalSnow);
}

// ========== 大气/雾效 ==========
vec3 applyAtmosphere(vec3 color) {
  // 底部雾/霾
  float fogAmount = smoothstep(0.4, 0.0, vUv.y);
  
  vec3 fogColor;
  if (uIsDay > 0.5) {
    if (uWeatherType < 1.5) {
      fogColor = vec3(0.92, 0.96, 0.99); // 晴天薄雾
    } else if (uWeatherType < 3.5) {
      fogColor = vec3(0.75, 0.80, 0.86); // 雨天灰雾
    } else {
      fogColor = vec3(0.85, 0.88, 0.92); // 雪天冷雾
    }
  } else {
    fogColor = vec3(0.1, 0.13, 0.18);
  }
  
  float fogStrength = 0.15 + uCloudCover * 0.003;
  return mix(color, fogColor, fogAmount * fogStrength);
}

// ========== 主函数 ==========
void main() {
  vec3 color = getSkyColor();
  color = renderCelestial(color);
  color = renderClouds(color);
  color = applyAtmosphere(color);
  color = renderRain(color);
  color = renderSnow(color);
  color = renderWaterDrops(color);
  
  gl_FragColor = vec4(color, 1.0);
}
