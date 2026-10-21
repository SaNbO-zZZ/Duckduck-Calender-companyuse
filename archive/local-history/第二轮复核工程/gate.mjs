// 从源文件抽取 createFrameGate，用合成 rAF 时间戳序列验证平均绘制帧率
import { readFileSync } from "fs";
const html = readFileSync("/Users/xz/Desktop/鸭鸭日历.html", "utf8");
const start = html.indexOf("function createFrameGate");
let i = html.indexOf("{", start), depth = 0;
for (; i < html.length; i++) {
  if (html[i] === "{") depth++;
  else if (html[i] === "}" && --depth === 0) break;
}
const createFrameGate = new Function(html.slice(start, i + 1) + "; return createFrameGate;")();
function naive(target) {
  let last = -1;
  return { shouldDraw(now) { if (last < 0) { last = now; return false; } if (now - last >= 1000 / target) { last = now; return true; } return false; } };
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rows = [];
for (const hz of [60, 90, 120, 144, 165]) {
  for (const target of [60, 30]) {
    for (const jitter of [0, 0.5]) {
      const res = {};
      for (const [name, mk] of [["gate", createFrameGate], ["naive", naive]]) {
        const g = mk(target);
        let n = 0, t = 1000;
        const T = 20000;
        for (let k = 0; t < 1000 + T; k++) {
          t = 1000 + (k * 1000) / hz + (rnd() - 0.5) * 2 * jitter;
          if (g.shouldDraw(t)) n++;
        }
        res[name] = +((n * 1000) / T).toFixed(1);
      }
      rows.push({ hz, target, jitterMs: jitter, ...res });
    }
  }
}
// 长卡顿后不补帧：60Hz 下停 500ms
const g = createFrameGate(60);
let burst = 0;
for (let k = 0; k < 60; k++) g.shouldDraw(k * 16.667);
for (let k = 0; k < 5; k++) if (g.shouldDraw(1500 + k * 16.667)) burst++;
console.log(JSON.stringify({ rows, afterStall5Callbacks: burst }, null, 1));
