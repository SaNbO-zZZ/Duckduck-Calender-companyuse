// WebGL 1 天空：只画背景，正文在独立 DOM 层。
    // 约定：y 轴向上；"下落" = 屏幕 y 减小；风的水平分量带符号（+ 向右 / − 向左），由 JS 统一给出。
    // 所有随时间累积的位移（云、雨、雪）都由 JS 积分后以 uniform 传入，阵风时速度平滑变化而不跳位。
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    varying vec2 vUv;
    uniform vec2 uResolution;   // 绘图缓冲像素
    uniform float uPxScale;     // 每 CSS 像素对应的缓冲像素
    uniform float uAspect;
    uniform float uTime;        // 仅用于摆动、闪烁等周期细节

    // —— 日照（JS 按瑶海区坐标与时间计算） ——
    uniform vec2 uSunPos;       // 屏幕 uv，可超出 0..1（高太阳在画面上方之外）
    uniform float uSunVis;      // 太阳在地平线以上的可见度
    uniform float uDaylight;    // 0 夜间 … 1 白天
    uniform float uWarmth;      // 低太阳暖色强度
    uniform float uTwilight;    // 民用晨昏蒙影
    uniform vec3 uMoon;         // xy 示意位置，z 可见度（示意，不代表真实月相）
    uniform float uFullMoon;
    uniform float uMoonScale;   // 万圣节夜景的舞台月亮尺寸；仍受云层遮挡

    // —— 云与风 ——
    uniform float uCloudCover;  // 0..1
    uniform float uWindStretch; // 0..1 风大时云沿风向拉长（随风速平滑变化）
    uniform float uScud;        // 0..1 已有云层被强风吹碎的程度（不新增云量）
    uniform vec2 uCloudFar;
    uniform vec2 uCloudNear;
    uniform vec2 uScudShift;
    uniform vec3 uHeroCloud;    // 多云：经过太阳的那团云，xy 为 (x*aspect, y)，z 强度

    // —— 降水 ——
    uniform float uRain;        // 0..3
    uniform float uRainSlope;   // 每下落 1 像素的水平位移（向右为正、向左为负）
    uniform vec3 uRainFall;     // 三层雨丝累计下落量（CSS 像素）
    uniform float uSnow;        // 0..3
    uniform vec3 uSnowFall;     // 三层雪累计下落量（视口高度）
    uniform vec3 uSnowDrift;    // 三层雪累计水平漂移（视口高度）
    uniform float uGlass;       // 玻璃水珠（默认关闭）

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
      vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(
        mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), s.x),
        mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0, 1.0)), s.x),
        s.y
      );
    }

    // 四个固定倍频：第四层给云边增加细碎感，避免整片"糊开"
    float cloudNoise(vec2 p) {
      return 0.52 * noise(p)
           + 0.26 * noise(p * 2.03 + vec2(8.7, 2.4))
           + 0.14 * noise(p * 4.09 + vec2(1.8, 9.3))
           + 0.08 * noise(p * 8.17 + vec2(4.6, 7.2));
    }

    // 降水时天空不应透出太阳；晴/多云保持原云量；风不参与此处计算。
    float clearness() {
      float c = 1.0 - smoothstep(0.55, 0.95, uCloudCover);
      return c * (1.0 - smoothstep(0.0, 0.6, uRain + uSnow));
    }

    // ===== 云层"透视"（风格化近似，不是严格的相机投影） =====
    // 把屏幕坐标映射到一张水平的云底平面：屏幕越低 = 越远，同样大小的云在屏幕上越小、越扁
    // （水平缩小 q 倍、竖直缩小 q² 倍）。k 越小透视越强（低云强、高云弱）。
    // 画面顶部 y = 1 处与屏幕坐标 1:1，太阳所在的顶部天空带里云团尺度与运动速度基本不变。
    vec2 cloudPlane(vec2 uv, float k) {
      float q = 1.0 / (max(uv.y, -0.2) + k);
      float qt = 1.0 / (1.0 + k);
      return vec2((uv.x - 0.5) * uAspect * q / qt + 0.5 * uAspect, 1.0 + (qt - q) / (qt * qt));
    }

    vec3 hash32(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yxz + 33.33);
      return fract((p3.xxy + p3.yzz) * p3.zyx);
    }

    // 积云团块：每格一个随机 puff（上圆、下扁平的半椭圆，大小/强度随机）求和成平滑并集，
    // 阈值等值线是一团团圆顶而不是噪声脊线的长条；puff 半径 ≤ 0.7 格、中心落在格内 0.2..0.8，只查最近的 2×2 格也无缝
    float puffs(vec2 p) {
      vec2 c = floor(p), f = fract(p);
      vec2 b = step(0.5, f) - 1.0;
      float s = 0.0;
      for (int j = 0; j <= 1; j++) {
        for (int i = 0; i <= 1; i++) {
          vec2 o = b + vec2(float(i), float(j));
          vec3 h = hash32(c + o);
          vec2 v = f - o - (0.2 + 0.6 * h.xy);
          v.y *= v.y < 0.0 ? 2.0 : 1.25;
          float r = 0.40 + 0.30 * h.z;
          float w = max(0.0, 1.0 - dot(v, v) / (r * r));
          s += w * w * (0.55 + 0.45 * fract(h.z * 13.7));
        }
      }
      return s;
    }

    // 连续的云体密度：三层湍流随同一坐标平移，避免分离的球体与规则鼓包。
    float cloudMass(vec2 p) {
      return 0.60 * noise(p * 1.25) + 0.26 * noise(p * 2.57 + vec2(3.7, 1.9)) + 0.14 * noise(p * 5.31 + vec2(1.8, 9.3));
    }
    // 遮阳云为不对称的连贯体积；边缘和内层密度随云移动，不用逐个球面的法线。
    float heroBlob(vec2 l, out vec4 sh, out float qc) {
      vec2 warp = (vec2(noise(l * 29.0 + 3.1), noise(l * 33.0 + vec2(7.7,1.3))) - 0.5) * 0.022;
      vec2 q = l + warp;
      vec2 a = (q - vec2(-0.025,-0.012)) / vec2(0.123,0.063);
      vec2 b = (q - vec2(0.080,-0.027)) / vec2(0.080,0.043);
      vec2 c = (q - vec2(-0.100,-0.024)) / vec2(0.065,0.038);
      float mass = 0.86*exp(-dot(a,a)*1.35) + 0.62*exp(-dot(b,b)*1.5) + 0.48*exp(-dot(c,c)*1.4);
      float detail = cloudMass(q * vec2(24.0,38.0)) - 0.5;
      mass += detail * 0.24 * smoothstep(0.05,0.35,mass);
      qc = clamp(mass,0.0,1.0);
      sh = vec4(clamp(a * 0.32,-1.0,1.0), qc, max(mass-0.2,0.0)*0.085);
      return max(0.0, 0.38 + (mass - 0.34) * 1.3);
    }

    // billow：圆顶外凸、相交处成尖缝，阈值等值线呈积云的花椰菜状轮廓
    float billow(vec2 p) {
      return abs(2.0 * noise(p) - 1.0);
    }

    // ===== 云：同一函数既用于绘制，也用于太阳遮挡采样 =====
    // 两层：高云（大尺度、低对比、边缘沿风向成纤维）在下，低积云（圆顶轮廓、明暗强）盖在上。
    // 返回 x 透明度、y 明暗、z 云边（用于逆光亮边）、w 厚度。
    // lighting = false 时只算透明度（太阳遮挡采样用）；透明度与 lighting 无关，两种调用结果一致。
    vec4 cloudSample(vec2 uv, bool lighting) {
      if (uCloudCover < 0.02) return vec4(0.0, 1.0, 0.0, 0.0);
      float rain = clamp(uRain / 3.0, 0.0, 1.0);
      float precip = clamp(uRain + uSnow, 0.0, 1.0);
      float overcast = smoothstep(0.62, 0.92, uCloudCover);
      // 风拉长只作用于近层，并以画面中心为基准缩放：
      // 远层大尺度云团保持不变，强风不会因为"换了一批大云团"而改变整体明暗
      float sx = 1.0 - 0.5 * uWindStretch;
      // 低云透视更强；雨天云底更低、离人更近 → 透视更强、云团更大
      float kN = mix(1.15, 0.85, rain);
      vec2 nScale = vec2(2.1, 3.4) * mix(1.0, 0.8, rain);
      vec2 pf = cloudPlane(uv, 2.2);
      vec2 pn = cloudPlane(uv, kN);
      pn.x = (pn.x - 0.5 * uAspect) * sx + 0.5 * uAspect;
      vec2 bf = pf * vec2(1.25, 2.3) + uCloudFar;
      vec2 bn = pn * nScale + uCloudNear + vec2(7.1, 0.8);
      // 屏幕越低越远：远处云边更软
      float dist = 1.0 - clamp(uv.y, 0.0, 1.0);
      float cov = 1.0 - uCloudCover;
      // —— 高云 ——（阈值按噪声分位数校准：晴≈1%、多云≈12%、阴≈连续）
      float tF = 0.16 + 0.70 * sqrt(cov) - 0.25 * precip;
      float fl = noise(bf);
      float farF = (0.52 * fl + 0.26 * noise(bf * 2.03 + vec2(8.7, 2.4)) + 0.14 * noise(bf * 4.09 + vec2(1.8, 9.3))) / 0.92;
      float rimF = 1.0 - smoothstep(0.0, 0.12, abs(farF - tF));
      if (rimF > 0.0) farF += rimF * (noise(bf * vec2(2.6, 12.0) + vec2(3.1, 7.7)) - 0.5) * 0.24 * (1.0 - overcast);
      float softF = mix(0.05, 0.14, overcast) * (1.0 + 0.8 * dist);
      float aF = smoothstep(tF - softF, tF + softF * 2.0, farF) * mix(0.62, 0.96, overcast);
      // —— 低积云 ——（域扭曲打破噪声格子感；扭曲随云平移，不会原地"游动"）
      vec2 warp = (vec2(noise(bn * 0.55 + vec2(2.3, 9.1)), noise(bn * 0.55 + vec2(6.7, 1.9))) - 0.5) * 0.6;
      bn += warp;
      // 连贯的湍流密度场，细节侵蚀轮廓；云量仅由天气决定。
      float tN = mix(0.82, 0.32, uCloudCover) - 0.04 * precip;
      float nearF = cloudMass(bn) + 0.025 * (noise(bn * 10.7) - 0.5);
      vec2 hp = vec2(uv.x * uAspect, uv.y);
      float hb = 0.0, hqc = 0.0;
      vec4 hs = vec4(0.0);
      vec2 local = hp - uHeroCloud.xy;
      if (uHeroCloud.z > 0.001) {
        // 经过太阳的云团：细节噪声锚定在云团中心；核心实心，细节只侵蚀轮廓（遮挡过程亮度单调）
        hb = heroBlob(local, hs, hqc);
        if (hb > 0.01) {
          float detail = billow(local * vec2(10.0, 16.0) + 3.7) * 0.6 + billow(local * vec2(23.0, 33.0) + 8.1) * 0.4;
          nearF = max(nearF, tN + uHeroCloud.z * (hb - 0.38 + (detail - 0.38) * 0.45 * smoothstep(0.30, 0.48, hb) * (1.0 - smoothstep(0.45, 0.85, hb))));
        }
      }
      // 云边再叠一级高倍频 billow（均值≈0，不改云量）：轮廓由小圆顶组成，而不是统一的模糊边；
      // 英雄云轮廓只用它自带的锚定细节（静止的天空噪声会在移动云边上"冒"出碎块，遮阳时亮度跳动）
      float rimN = (1.0 - smoothstep(0.0, 0.08, abs(nearF - tN))) * (1.0 - smoothstep(0.02, 0.2, hb * uHeroCloud.z));
      if (rimN > 0.0) nearF += rimN * (billow(bn * 8.3 + vec2(4.6, 7.2)) - 0.36) * 0.10 * (1.0 - 0.6 * overcast);
      // 边缘过渡带：下限 = 一个缓冲像素内场值的变化（防锯齿），其余尽量陡；远处与阴天更软
      float qN = 1.0 / (max(uv.y, -0.2) + kN), qtN = 1.0 / (1.0 + kN);
      vec2 fpN = vec2(nScale.x * sx * uAspect * qN / qtN / uResolution.x, 1.8 * nScale.y * qN * qN / (qtN * qtN) / uResolution.y);
      float softN = max(2.0 * 2.0 * length(fpN), mix(0.006, 0.07, overcast) * (1.0 + 1.5 * dist));
      // 英雄云边缘带宽约 1–2 像素的柔和过渡（否则像贴纸描边）
      softN = max(softN, 0.03 * uHeroCloud.z * smoothstep(0.01, 0.2, hb));
      float aN = smoothstep(tN - softN, tN + softN, nearF) * mix(0.97, 0.92, overcast);
      float alpha = aN + aF * (1.0 - aN);
      float thickF = smoothstep(tF, tF + 0.30, farF);
      float thick = max(smoothstep(tN, tN + 0.22, nearF), thickF * 0.5);
      float edge = max(aN * (1.0 - aN), 0.6 * aF * (1.0 - aF)) * 4.0;
      if (!lighting || alpha < 0.002) return vec4(alpha, 1.0, edge, thick);
      // 受光（廉价的 2D 体积光照近似）：光来自屏幕上"朝向太阳"的方向（阴天/夜间退化为从上方来）。
      vec2 toSun = (uSunPos - uv) * vec2(uAspect, 1.0);
      // 太阳总在云层之上：方向偏向竖直，云顶亮、云底暗，再按太阳方位侧偏
      vec2 dir = normalize(mix(vec2(0.0, 1.0), toSun / max(length(toSun), 1e-3), 0.6 * uSunVis * (1.0 - overcast)) + vec2(0.0, 1e-4));
      vec2 stepUv = dir * vec2(1.0 / uAspect, 1.0);
      // 低积云：朝太阳方向取两点低频密度，累加光学厚度后做 Beer 衰减 →
      // 迎光的圆顶亮、背光侧与云底暗；扭曲量沿用本像素的（低频，偏移量内近似不变）
      vec2 uv1 = uv + stepUv * 0.024;
      vec2 uv2 = uv + stepUv * 0.070;
      vec2 p1 = cloudPlane(uv1, kN);
      vec2 p2 = cloudPlane(uv2, kN);
      p1.x = (p1.x - 0.5 * uAspect) * sx + 0.5 * uAspect;
      p2.x = (p2.x - 0.5 * uAspect) * sx + 0.5 * uAspect;
      vec2 b1 = p1 * nScale + uCloudNear + vec2(7.1, 0.8) + warp;
      vec2 b2 = p2 * nScale + uCloudNear + vec2(7.1, 0.8) + warp;
      float d1 = cloudMass(b1);
      float d2 = cloudMass(b2);
      float own = max(nearF - tN, 0.0);
      float od = max(d1 - tN, 0.0) + 0.6 * max(d2 - tN, 0.0) + 0.3 * own;
      float sunlit = exp(-od * 9.0);
      // 夜间、阴天明暗对比收敛；暗部有天光托底，不会发黑；云边薄处透光略亮
      float contrast = mix(0.35, 1.0, uDaylight) * mix(1.0, 0.7, overcast);
      float lightN = 1.0 - contrast * 0.70 * (1.0 - sunlit) + 0.06 * (1.0 - smoothstep(0.0, 0.12, own)) * sunlit;
      // 圆顶起伏：鼓包与 billow 朝阳差分 → 云体内部每个小圆顶也有迎光/背光
      lightN -= clamp(d1 - nearF, -0.15, 0.15) * 1.2 * contrast * smoothstep(0.0, 0.08, own);
      float hw = smoothstep(0.25, 0.40, hb) * clamp(uHeroCloud.z, 0.0, 1.0);
      if (hw > 0.0) {
        // 大尺度厚度控制暗部，迎光方向的连续细节控制亮部，避免逐球发亮的泡沫质感。
        vec2 sd = uSunPos * vec2(uAspect,1.0) - hp;
        float sdist = length(sd);
        vec2 lightDir = normalize(sd + vec2(0.0,0.08));
        float density = cloudMass(local * vec2(24.0,38.0));
        float toward = cloudMass((local + lightDir * 0.006) * vec2(24.0,38.0));
        float transmit = exp(-hs.w * 15.0);
        float hl = 0.35 + 0.26 * transmit + 0.20 * smoothstep(-0.065,0.05,local.y) + clamp(density-toward,-0.12,0.12) * 0.9;
        hl *= mix(0.85,1.0,smoothstep(-0.08,0.012,local.y));
        float hcore = mix(0.86,0.62,smoothstep(0.0,0.9,hqc));
        hl = mix(hl,hcore,1.0-smoothstep(0.02,0.045,sdist));
        lightN = mix(lightN,1.0-contrast*(1.0-hl),hw);
      }
      if (hb > 0.01) {
        // 银边只留在朝阳一侧的轮廓
        vec2 sd2 = uSunPos * vec2(uAspect, 1.0) - hp;
        float face = smoothstep(-0.1, 0.8, dot(hs.xy, sd2) / max(length(sd2), 1e-3));
        edge *= mix(1.0, 0.12 + 0.63 * face, clamp(uHeroCloud.z, 0.0, 1.0) * smoothstep(0.02, 0.045, length(sd2)) * smoothstep(0.01, 0.2, hb));
      }
      lightN = min(lightN, 1.0) * mix(1.0, 0.82, overcast);
      // 高云：一次朝阳差分即可（低对比、偏亮，像远处被大气冲淡）
      float fl1 = noise(cloudPlane(uv + stepUv * 0.05, 2.2) * vec2(1.25, 2.3) + uCloudFar);
      float sunward = (fl1 - fl) * mix(0.45, 1.0, uDaylight);
      float lightF = clamp(0.88 - sunward * 2.2 - thickF * 0.14, 0.0, 1.0);
      // 阴天：连续云盖，靠大尺度起伏 + 受光差分做出层次（"云卷"），雨天整体更暗
      float deck = clamp(0.58 + (farF - 0.5) * 1.5 - sunward * 2.0 + uv.y * 0.07, 0.0, 1.0);
      lightF = mix(lightF, deck, overcast);
      float light = (lightN * aN + lightF * aF * (1.0 - aN)) / max(alpha, 1e-3);
      // 降水云底更厚更暗（雪天略暗）
      light *= 1.0 - 0.22 * clamp(uRain, 0.0, 1.0) - 0.08 * clamp(uSnow, 0.0, 1.0);
      if (uScud > 0.01) {
        // 强风把已有云层吹碎：只在已有云的地方叠加快速移动的明暗起伏，
        // 起伏均值约为 0（不整体变暗），也不提高透明度，因此不新增云量、不改天空底色
        float s = cloudNoise(pn * vec2(4.4, 8.0) + uScudShift + vec2(3.3, 5.1));
        float low = 1.0 - smoothstep(0.25, 1.0, uv.y);
        float amp = uScud * alpha * (0.55 + 0.45 * low);
        light = clamp(light + (s - 0.5) * 0.5 * amp, 0.0, 1.0);
        edge = max(edge, smoothstep(0.55, 0.76, s) * amp * 0.5);
      }
      return vec4(alpha, light, edge, thick);
    }

    // ===== 天空底色：随太阳高度、云量、降水连续变化 =====
    vec3 skyColor(vec2 uv, float clear) {
      float h = clamp(uv.y, 0.0, 1.0);
      vec3 dayTop = mix(vec3(0.17, 0.44, 0.80), vec3(0.32, 0.45, 0.68), uWarmth);
      vec3 dayBot = mix(vec3(0.62, 0.78, 0.93), vec3(0.95, 0.79, 0.62), uWarmth);
      vec3 top = mix(vec3(0.020, 0.035, 0.075), dayTop, uDaylight);
      vec3 bot = mix(vec3(0.060, 0.090, 0.160), dayBot, uDaylight);
      top = mix(top, vec3(0.10, 0.14, 0.30), uTwilight * 0.65);
      bot = mix(bot, vec3(0.80, 0.50, 0.46), uTwilight * 0.75);
      vec3 sky = mix(bot, top, pow(h, 0.7));
      // 朝霞/晚霞：只在太阳一侧的低空，且需天空足够通透
      float side = exp(-pow((uv.x - uSunPos.x) * uAspect, 2.0) * 0.9);
      float band = 1.0 - smoothstep(0.0, 0.55, h);
      sky += vec3(0.30, 0.13, 0.02) * (uWarmth * uDaylight + uTwilight * 0.6) * side * band * clear;
      // 阴、雨、雪：连续灰色云盖
      float rain = clamp(uRain / 3.0, 0.0, 1.0);
      float snow = clamp(uSnow / 3.0, 0.0, 1.0);
      vec3 greyTop = mix(vec3(0.55, 0.60, 0.67), vec3(0.33, 0.39, 0.47), rain);
      vec3 greyBot = mix(vec3(0.74, 0.77, 0.81), vec3(0.50, 0.55, 0.62), rain);
      greyTop = mix(greyTop, vec3(0.50, 0.56, 0.64), snow);
      greyBot = mix(greyBot, vec3(0.70, 0.74, 0.80), snow);
      vec3 grey = mix(greyBot, greyTop, h);
      grey = mix(vec3(0.050, 0.065, 0.095) + grey * 0.06, grey, uDaylight);
      float overcast = smoothstep(0.55, 0.95, uCloudCover);
      return mix(sky, grey, overcast * 0.88);
    }

    // ===== 太阳：光晕随云遮挡 occl 一起衰减 =====
    vec3 addSun(vec3 sky, vec2 uv, float clear, float occl, float cover) {
      float vis = uSunVis * clear;
      if (vis < 0.002) return sky;
      vec2 d = (uv - uSunPos) * vec2(uAspect, 1.0);
      float r2 = dot(d, d);
      vec3 sunCol = mix(vec3(1.0, 0.97, 0.90), vec3(1.0, 0.70, 0.42), uWarmth);
      float through = 1.0 - occl * 0.88;
      // 正午光线集中；低太阳光晕更宽更暖
      float tight = mix(0.0025, 0.0045, uWarmth);
      float wide = mix(0.040, 0.10, uWarmth);
      float glow = exp(-r2 / tight) * 0.30 + exp(-r2 / wide) * mix(0.13, 0.18, uWarmth);
      sky += sunCol * glow * vis * through;
      // 一个克制的光学残影，沿太阳—画面中心轴
      vec2 ghost = (uv - (uSunPos + (vec2(0.5) - uSunPos) * 1.4)) * vec2(uAspect, 1.0);
      sky += sunCol * (1.0 - smoothstep(0.012, 0.030, length(ghost))) * 0.035 * vis * through;
      // 日面始终是最亮处；低太阳略带暖色。日面按本像素的云量逐像素隐现（云边扫过时日面被"切开"，
      // 不再按日心一点整体开关 → 遮阳亮度随云边推进单调变化）
      float core = (1.0 - smoothstep(0.016, 0.021, sqrt(r2))) * (1.0 - smoothstep(0.3, 0.8, cover) * 0.97);
      return mix(sky, mix(vec3(1.0, 0.995, 0.97), vec3(1.0, 0.86, 0.66), uWarmth * 0.7), core * vis);
    }

    // ===== 夜间：示意月亮与少量星点 =====
    vec3 addNight(vec3 sky, vec2 uv, float clear) {
      float night = 1.0 - smoothstep(0.05, 0.45, uDaylight);
      float vis = night * clear;
      if (vis < 0.002) return sky;
      vec2 starUv = gl_FragCoord.xy / uPxScale / 26.0;
      vec2 starId = floor(starUv);
      float seed = hash12(starId);
      if (seed > 0.991) {
        float star = 1.0 - smoothstep(0.03, 0.09, length(fract(starUv) - 0.5));
        float twinkle = 0.78 + 0.22 * sin(uTime * 0.6 + seed * 20.0);
        sky += vec3(0.55, 0.60, 0.70) * star * twinkle * vis * smoothstep(0.15, 0.6, uv.y);
      }
      vec2 d = (uv - uMoon.xy) * vec2(uAspect, 1.0);
      float r = length(d);
      float disc = 1.0 - smoothstep(0.0125 * uMoonScale, 0.0155 * uMoonScale, r);
      float lit = 1.0 - smoothstep(0.011 * uMoonScale, 0.016 * uMoonScale, length(d - vec2(-0.0055, 0.002) * uMoonScale)) * 0.82;
      lit = mix(lit, 1.0, uFullMoon);
      float halo = exp(-r * r / (0.004 * uMoonScale * uMoonScale)) * 0.09 + exp(-r * r / (0.05 * uMoonScale * uMoonScale)) * 0.035;
      sky += vec3(0.72, 0.80, 0.94) * halo * vis * uMoon.z;
      return mix(sky, vec3(0.88, 0.91, 0.95) * (0.30 + 0.70 * lit), disc * vis * uMoon.z);
    }

    vec3 addClouds(vec3 sky, vec2 uv, vec4 c, float clear) {
      if (c.x < 0.003) return sky;
      float overcast = smoothstep(0.62, 0.92, uCloudCover);
      float rain = clamp(uRain / 3.0, 0.0, 1.0);
      vec3 lit = mix(vec3(0.98, 0.985, 0.99), vec3(0.80, 0.83, 0.87), overcast);
      vec3 shadow = mix(vec3(0.57, 0.64, 0.74), vec3(0.55, 0.60, 0.67), overcast);
      lit = mix(lit, vec3(0.58, 0.64, 0.72), rain);
      shadow = mix(shadow, vec3(0.33, 0.39, 0.48), rain);
      // 早霞晚霞：只在云量适中、非阴雨时给云边上色
      vec3 sunCol = mix(vec3(1.0, 0.97, 0.90), vec3(1.0, 0.66, 0.40), uWarmth);
      float glowAmt = (uWarmth * uDaylight + uTwilight * 0.8) * clear;
      lit = mix(lit, lit * sunCol * 1.04, glowAmt * 0.5);
      shadow = mix(shadow, vec3(0.60, 0.47, 0.55), uTwilight * clear * 0.5);
      lit = mix(vec3(0.15, 0.19, 0.26), lit, uDaylight);
      shadow = mix(vec3(0.065, 0.09, 0.135), shadow, uDaylight);
      vec3 col = mix(shadow, lit, c.y);
      // 逆光：挡在太阳前的厚云发灰，薄处透光，云边微亮（克制的银边）
      vec2 d = (uv - uSunPos) * vec2(uAspect, 1.0);
      float r2 = dot(d, d);
      float nearW = exp(-r2 / mix(0.03, 0.06, uWarmth)) * uSunVis * clear;
      float nearT = exp(-r2 / 0.004) * uSunVis * clear;
      // 逆光压暗按比例，保留云体内部明暗层次（不再压成同一灰）
      col = mix(col, col * 0.80, nearW * c.w * 0.75);
      // 低太阳的前向散射亮边收敛（晨昏只克制暖色）
      col += sunCol * (c.z * 0.40 * nearW + (1.0 - c.w) * 0.30 * nearT) * mix(1.0, 0.6, uWarmth);
      col += vec3(0.20, 0.08, 0.02) * c.z * glowAmt * 0.25;
      // 远近层次：靠近地平线的云更远，更淡、更融进大气色（阴天云盖保持连续，不减淡）
      float haze = (1.0 - smoothstep(0.0, 0.5, uv.y)) * (1.0 - overcast);
      col = mix(col, sky, haze * 0.25);
      return mix(sky, col, clamp(c.x * (1.0 - haze * 0.35), 0.0, 0.97));
    }

    vec3 addAtmosphere(vec3 col, vec2 uv) {
      float fog = 1.0 - smoothstep(0.0, 0.45, uv.y);
      float rain = clamp(uRain / 3.0, 0.0, 1.0);
      vec3 fogDay = mix(vec3(0.86, 0.90, 0.94), vec3(0.66, 0.71, 0.77), uCloudCover);
      fogDay = mix(fogDay, vec3(0.46, 0.52, 0.60), rain);
      fogDay = mix(fogDay, vec3(0.95, 0.80, 0.66), uWarmth * (1.0 - uCloudCover) * 0.5);
      vec3 fogCol = mix(vec3(0.07, 0.10, 0.15), fogDay, uDaylight);
      col = mix(col, fogCol, fog * (0.10 + uCloudCover * 0.10));
      // 暴雨的雨幕雾气
      return mix(col, fogCol, rain * rain * 0.20);
    }

    // 无雨雪遮挡的天空；玻璃水珠的折射也采样它
    vec3 skyScene(vec2 uv, float occl) {
      uv = clamp(uv, 0.0, 1.0);
      float clear = clearness();
      vec3 col = skyColor(uv, clear);
      col = addNight(col, uv, clear);
      vec4 c = cloudSample(uv, true);
      col = addSun(col, uv, clear, occl, c.x);
      col = addClouds(col, uv, c, clear);
      return addAtmosphere(col, uv);
    }

    // ===== 雨丝：剪切格子让雨丝方向 = 运动方向；拖尾在上（运动后方），头部在下 =====
    // css：CSS 像素坐标（y 向上）；fall：该层累计下落量；格子 id 以 128 为周期，JS 按周期回绕 fall。
    float rainLayer(vec2 css, float fall, vec2 cell, float density, float len, float width, float seed) {
      float fromTop = uResolution.y / uPxScale - css.y;
      vec2 q = vec2(css.x - uRainSlope * fromTop, css.y + fall);
      vec2 id = floor(q / cell);
      vec2 hid = mod(id, 128.0) + seed;
      if (hash12(hid) > density) return 0.0;
      vec2 center = (id + 0.5) * cell + (hash22(hid + 11.3) - 0.5) * cell * vec2(0.62, 0.55);
      vec2 d = q - center;
      float L = len * mix(0.7, 1.3, hash12(hid + 5.7));
      float t = (L * 0.5 - d.y) / L; // 0 = 拖尾末端（上方），1 = 雨滴头部（下方）
      if (t < 0.0 || t > 1.0) return 0.0;
      float along = smoothstep(0.0, 0.8, t) * (1.0 - smoothstep(0.93, 1.0, t));
      float across = abs(d.x) * inversesqrt(1.0 + uRainSlope * uRainSlope);
      float w = width * 0.5;
      return along * (1.0 - smoothstep(w, w + 0.9, across));
    }

    vec3 addRain(vec3 col) {
      if (uRain < 0.03) return col;
      float r = clamp(uRain / 3.0, 0.0, 1.0);
      vec2 css = gl_FragCoord.xy / uPxScale;
      float farRain = rainLayer(css, uRainFall.x, vec2(12.0, 90.0), mix(0.12, 0.62, r), mix(12.0, 22.0, r), 0.9, 0.0);
      float midRain = rainLayer(css, uRainFall.y, vec2(24.0, 150.0), mix(0.10, 0.48, r), mix(20.0, 42.0, r), 1.15, 37.0);
      float nearRain = rainLayer(css, uRainFall.z, vec2(44.0, 240.0), mix(0.07, 0.36, r), mix(32.0, 72.0, r), 1.6, 71.0);
      float a = min(farRain * 0.40 + midRain * 0.52 + nearRain * 0.62, 0.78);
      a *= smoothstep(0.0, 0.10, uRain);
      vec3 rainCol = mix(vec3(0.52, 0.60, 0.70), vec3(0.90, 0.93, 0.97), uDaylight);
      return mix(col, rainCol, a);
    }

    // ===== 雪：三层远近、不同大小与散焦；风使整体漂移，仍以下落为主 =====
    float snowLayer(vec2 p, float fall, float drift, float scale, float density, float size, float soft, float seed) {
      vec2 q = (p + vec2(-drift, fall)) * scale;
      vec2 id = floor(q);
      vec2 hid = mod(id, 128.0) + seed;
      if (hash12(hid) > density) return 0.0;
      vec2 j = hash22(hid + 4.2);
      vec2 local = fract(q) - 0.5 - (j - 0.5) * 0.35;
      local.x += sin(uTime * mix(0.6, 1.3, j.x) + j.y * 6.28) * 0.10;
      float s = size * mix(0.6, 1.3, hash12(hid + 9.1));
      return 1.0 - smoothstep(s * (1.0 - soft), s, length(local));
    }

    vec3 addSnow(vec3 col, vec2 uv) {
      if (uSnow < 0.03) return col;
      float s = clamp(uSnow / 3.0, 0.0, 1.0);
      vec2 p = vec2(uv.x * uAspect, uv.y);
      float farSnow = snowLayer(p, uSnowFall.x, uSnowDrift.x, 46.0, mix(0.12, 0.66, s), 0.10, 0.60, 0.0);
      float midSnow = snowLayer(p, uSnowFall.y, uSnowDrift.y, 24.0, mix(0.06, 0.40, s), 0.12, 0.45, 19.0);
      float nearSnow = snowLayer(p, uSnowFall.z, uSnowDrift.z, 10.0, mix(0.0, 0.20, s), 0.11, 0.85, 41.0);
      float a = clamp(farSnow * 0.55 + midSnow * 0.88 + nearSnow * 0.45, 0.0, 0.95);
      vec3 snowCol = mix(vec3(0.70, 0.77, 0.86), vec3(1.0), uDaylight);
      return mix(col, snowCol, a * smoothstep(0.0, 0.10, uSnow));
    }

    // ===== 玻璃水珠（可选，默认关闭；不再承担雨量表达） =====
    vec3 addGlassDrops(vec3 color, vec2 uv, float occl) {
      if (uGlass < 0.5 || uRain < 0.5) return color;
      float intensity = clamp(uRain / 3.0, 0.0, 1.0);
      float aspect = max(uAspect, 0.1);
      float pixel = 1.0 / max(uResolution.y, 1.0);
      vec2 point = uv * vec2(aspect, 1.0);
      vec3 result = color;
      float count = floor(mix(4.0, 10.0, intensity) + 0.5);
      for (int i = 0; i < 10; i++) {
        if (float(i) >= count) break;
        vec2 seed = vec2(float(i) * 7.31 + 1.7, float(i) * 13.17 + 5.9);
        vec2 base = hash22(seed);
        float sizeRandom = hash12(seed + 7.7);
        float size = mix(0.004, 0.012, sizeRandom);
        float fallSpeed = mix(0.004, 0.06, sizeRandom * sizeRandom);
        // y 减小 = 向下滑；拖尾位于水珠上方（运动后方）
        float y = mod(base.y - uTime * fallSpeed + 0.18, 1.36) - 0.18;
        float x = base.x * aspect + uRainSlope * (base.y - y) * 0.15;
        vec2 delta = point - vec2(x, y);
        float trailLength = size * mix(2.0, 4.5, intensity) * smoothstep(0.35, 0.95, sizeRandom);
        if (abs(delta.x) > size * 1.5 + pixel || delta.y < -size - pixel || delta.y > size + trailLength + pixel) continue;
        float trailY = (delta.y - size * 0.45) / max(trailLength, pixel);
        if (trailLength > pixel && trailY > 0.0 && trailY < 1.0) {
          float trailWidth = size * 0.16 * (1.0 - trailY * 0.65);
          float trailMask = (1.0 - smoothstep(trailWidth * 0.45, trailWidth + pixel, abs(delta.x)))
                          * (1.0 - smoothstep(0.55, 1.0, trailY));
          result = mix(result, skyScene(uv, occl) * 1.025, trailMask * 0.20);
        }
        vec2 cap = delta / size;
        float radius2 = dot(cap, cap);
        if (radius2 < 1.0) {
          float nz = sqrt(max(1.0 - radius2, 0.001));
          vec3 normal = normalize(vec3(cap, nz));
          vec3 lens = refract(vec3(0.0, 0.0, -1.0), normal, 0.75);
          vec3 dropColor = skyScene(uv + lens.xy * size * 2.8 * vec2(1.0 / aspect, 1.0), occl);
          dropColor *= 1.0 - pow(1.0 - nz, 3.0) * 0.19;
          float body = 1.0 - smoothstep(0.85, 1.0, sqrt(radius2));
          result = mix(result, dropColor, body * 0.9);
        }
      }
      return result;
    }

    void main() {
      // 太阳中心处的云量：与绘制云使用同一函数，保证"云真正遮住太阳"
      // 遮挡只影响太阳光晕与残影，离两者足够远的像素（光晕已 < 1/1000）跳过这次采样以省算力
      float occl = 0.0;
      if (uSunVis * clearness() > 0.002 && uCloudCover > 0.02) {
        vec2 ds = (vUv - uSunPos) * vec2(uAspect, 1.0);
        vec2 dg = (vUv - (uSunPos + (vec2(0.5) - uSunPos) * 1.4)) * vec2(uAspect, 1.0);
        if (dot(ds, ds) < 0.9 || dot(dg, dg) < 0.002) occl = cloudSample(uSunPos, false).x;
      }
      vec3 color = skyScene(vUv, occl);
      color = addRain(color);
      color = addSnow(color, vUv);
      color = addGlassDrops(color, vUv, occl);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
