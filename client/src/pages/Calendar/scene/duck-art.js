export const DuckArt = (() => {
"use strict";

// =====================================================================
// 1. 调色板（索引 0 = 透明）
// =====================================================================
const PALETTE = [
null,
[32, 24, 24],    // 1  K   炭黑轮廓 / 眼
[248, 248, 240], // 2  W   白羽
[224, 216, 200], // 3  c   奶白阴影
[196, 186, 168], // 4  C   深阴影
[248, 156, 28],  // 5  o   橙（嘴/脚）
[224, 112, 16],  // 6  O   深橙
[168, 72, 24],   // 7  r   橙褐描边
[96, 56, 40],    // 8  B   嘴缝棕
[216, 60, 52],   // 9  红
[150, 36, 40],   // 10 深红
[240, 150, 150], // 11 粉
[96, 172, 80],   // 12 绿
[44, 108, 60],   // 13 深绿
[168, 212, 104], // 14 浅绿
[196, 132, 72],  // 15 木
[132, 82, 48],   // 16 深木
[236, 204, 128], // 17 草黄
[196, 150, 80],  // 18 深草黄
[72, 128, 208],  // 19 蓝
[40, 72, 140],   // 20 深蓝
[156, 204, 240], // 21 水蓝
[252, 214, 80],  // 22 灯黄
[216, 156, 40],  // 23 深黄
[150, 152, 164], // 24 灰
[88, 90, 104],   // 25 深灰
[214, 220, 230], // 26 浅灰（热气）
[184, 204, 230], // 27 雪影
[64, 170, 168],  // 28 青
[32, 108, 116],  // 29 深青
[156, 112, 196], // 30 紫
[100, 70, 140],  // 31 深紫
[255, 238, 176], // 32 暖光
[56, 60, 78],    // 33 墨镜片
];
const K = 1, W = 2, c = 3, C = 4, o = 5, O = 6, r = 7, B = 8,
RED = 9, DRED = 10, PINK = 11, GRN = 12, DGRN = 13, LGRN = 14, WOOD = 15, DWOOD = 16,
STRAW = 17, DSTRAW = 18, BLUE = 19, DBLUE = 20, WATER = 21, YEL = 22, DYEL = 23,
GRY = 24, DGRY = 25, LGRY = 26, SNOWS = 27, TEAL = 28, DTEAL = 29, PURP = 30, DPURP = 31,
GLOW = 32, LENS = 33;
// 成对配色 [主色, 暗色]
const DUO = { red: [RED, DRED], blue: [BLUE, DBLUE], teal: [TEAL, DTEAL], green: [GRN, DGRN], purple: [PURP, DPURP], yellow: [YEL, DYEL], straw: [STRAW, DSTRAW], grey: [GRY, DGRY], pink: [PINK, RED] };

const FAMILIES = ["sunny", "cloudy", "lightRain", "heavyRain", "lightSnow", "heavySnow"];
const PHASES = ["dawn", "day", "dusk", "night"];

// =====================================================================
// 2. 像素模板（取自原素材 64 网格降采样后手工清理；e = 眼睛位）
// =====================================================================
const CH = { ".": 0, K: 1, W: 2, c: 3, C: 4, o: 5, O: 6, r: 7, B: 8, e: 2 };
function tpl(rows, meta) {
const h = rows.length, w = Math.max(...rows.map(s => s.length));
const d = new Uint8Array(w * h), eyes = [];
rows.forEach((s, y) => { for (let x = 0; x < s.length; x++) { d[y * w + x] = CH[s[x]]; if (s[x] === "e") eyes.push([x, y]); } });
return Object.assign({ w, h, d, eyes }, meta);
}
// 正面头（06 号帧）。neck: 颈底中心 x；top: 帽座 [x,y]
const HEAD_F = tpl([
".....KKKKK.....",
"...KKWWWWWK....",
"..KCWWWWWWCK...",
"..KWWWWWWWWCK..",
".KCWWWWWWWWWK..",
".KCeWWWWWWeCK..",
".KCeWWWWWWeCK..",
"KWWWWooooWWWWK.",
"KWWWOoooooWWWK.",
"KWWOooooooCWWK.",
"KCOooooooooocK.",
".KoooooooooOK..",
".KooooOOOoOBK..",
".KKBBBBBBBBK...",
"..KCCCCCCCCK...",
], { neck: 6.5, top: [6.5, 0], bill: [6.5, 12], kind: "F" });
// 3/4 侧（朝右）
const HEAD_Q = tpl([
"....KKKKK.......",
"..KKWWWWWKK.....",
".KCWWWWWWWWK....",
".KWWWWWWWWWWK...",
"KCWWWWWWWWWWK...",
"KCWWeWWWWWeWK...",
"KCWWeWWWWWeWWK..",
"KCWWWWWWooooooK.",
"KCcWWWWOooooooOK",
"KCcWWWOooooooooK",
".KccWOooooooooOK",
".KcccKoooooooOrK",
"..KccKBOOOOOOBK.",
"..KcccKKKKKKKK..",
"..KCCCCCCCK.....",
], { neck: 6.5, top: [6, 0], bill: [11, 11], kind: "Q" });
// 侧面（朝右，闭嘴）
const HEAD_P = tpl([
"...KKKKK.............",
".KKWWWWWKK...........",
"KCWWWWWWWWK..........",
"KCWWWWWWWWWK.........",
"KCWWWWWWWeWWKKKK.....",
"KCWWWWWWWeWOooooKK...",
"KCcWWWWWWWOoooooooKK.",
"KCcWWWWWWWOooooooooOK",
".KccWWWWWWKBOOOOOOOK.",
".KcccWWWWWWKKKKKKKK..",
"..KcccWWWWK..........",
"..KCCCCCCCK..........",
], { neck: 6, top: [5, 0], bill: [19, 7], kind: "P" });
// 仰头（嘴朝右上）
const HEAD_U = tpl([
"............KKK..",
"...........KoooK.",
"..........KooooOK",
"...KKKKK.KoooooOK",
".KKWWWWWKooooOOK.",
"KCWWWWWWoooOOrK..",
"KCWWWWeWoooOrK...",
"KCWWWWeWOOOrK....",
"KCcWWWWWWKK......",
".KccWWWWWK.......",
".KcccWWWWK.......",
".KCCCCCCCK.......",
], { neck: 5.5, top: [4.5, 3], bill: [14, 1], kind: "U" });
// 正面身体（06 号帧，含颈根 4 行）
const BODY_F = tpl([
"..........KcccWWWWWK..........",
"..........KcccWWWWWK..........",
".........KccccWWWWWKK.........",
".........KcccccWWWWWK.........",
"........KCcccccWWWWWWKK.......",
"......KKWWcccccWWWWWWWWK......",
"....KKWWWWccccccWWWWWWWWK.....",
"...KKWWWWcccccccWWWWWWWWWKK...",
"...KWWWWWccccccWWWWWWWWWWWK...",
"...KWWWWWWWccWWWWWWWWWWWWWK...",
"..KWWWWWWWWWWWWWWWWWWWWWWWWK..",
"..KWWWWWWWWWWWWWWWWWWWWWWWWK..",
".KWWWWWWWWWWWWWWWWWWWWWWWWWcK.",
".KcWWWWWWWWWWWWWWWWWWWWWWWcWK.",
".KcWWWWWWWWWWWWWWWWWWWWWWWccK.",
".KccWccWWWWWWWWWWWWWWWWWcWccK.",
".KccccccWWWWWWWWWWWWWWWcccccK.",
"..KcccccccWWWWWWWWWWWccccccK..",
"..KccccccccWWWWWWWcccccccCcK..",
"...KWccccccccWWWccccccccccK...",
"...KWWcccccccccccccccccCCcK...",
"....KKcccccccccccccccccCKK....",
"......KccccccccccccccccCK.....",
"......KKKKcccccccccKKKK.......",
]);
// 站立双腿（06 号帧）
const LEGS_F = tpl([
"......KOOKKcccccKKBBK.......",
"......KooK.KKKKK.KooK.......",
"......KooK.......KooK.......",
"......KooK.......KooK.......",
".....KrooOK......KooK.......",
"...KKoooooK.....KroooK......",
"..KooooooooK....KOooooKK....",
".KooOOooOOoOK..KooooooooK...",
".KKKKoooKKKK..KooOOooOOooK..",
".....KKK......KKKKKoooKKKK..",
"...................KKK......",
]);
// 单脚掌（左/右，含踝 1 行），由 LEGS_F 切出
function slice(t, x0, y0, w, h) { const rows = []; for (let y = 0; y < h; y++) { let s = ""; for (let x = 0; x < w; x++) s += ".KWcCoOrB"[t.d[(y0 + y) * t.w + x0 + x]]; rows.push(s); } return tpl(rows); }
const FOOT_L = slice(LEGS_F, 0, 4, 14, 7), FOOT_R = slice(LEGS_F, 14, 4, 14, 7);
// 坐姿前伸的脚（吃瓜 19 号帧改绘）
const FEET_SIT = tpl([
"....KKK................KKK....",
"...KoooK..............KoooK...",
"..KooooOK............KOooooK..",
".KoooooOK............KOoooooK.",
"KooOoooOOK..........KOOoooOooK",
"KoOKooOKOK..........KOKOooKOoK",
".KK.KK.KK............KK.KK.KK.",
]);

// =====================================================================
// 3. 光栅核心（固定 111×88 画布，锚点 55,86）
// =====================================================================
const SW = 111, SH = 88, AX = 55, AY = 86, N = SW * SH;
let cv = null, own = null;               // 当前画布 / 归属层（1 腿 2 身 3 头 4 翅 5 道具 6 衣）
const POOL = [];
const lay = () => { const L = POOL.pop() || new Uint8Array(N); L.fill(0); return L; };
const free = L => POOL.push(L);
const R = Math.round;
function P(L, x, y, v) { x = R(x); y = R(y); if (x >= 0 && y >= 0 && x < SW && y < SH) L[y * SW + x] = v; }
function G(L, x, y) { return x >= 0 && y >= 0 && x < SW && y < SH ? L[y * SW + x] : 0; }
function ell(L, cx, cy, rx, ry, v) {
for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
const t = (y - cy) / ry, d = rx * Math.sqrt(Math.max(0, 1 - t * t));
for (let x = Math.ceil(cx - d - 1e-6); x <= Math.floor(cx + d + 1e-6); x++) P(L, x, y, v);
}
}
function rect(L, x0, y0, x1, y1, v) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(L, x, y, v); }
// 粗线段（半径 r0→r1）
function seg(L, x0, y0, x1, y1, r0, r1, v) {
const rr = Math.max(r0, r1), dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
for (let y = Math.floor(Math.min(y0, y1) - rr); y <= Math.ceil(Math.max(y0, y1) + rr); y++)
for (let x = Math.floor(Math.min(x0, x1) - rr); x <= Math.ceil(Math.max(x0, x1) + rr); x++) {
let t = ((x - x0) * dx + (y - y0) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
const ex = x0 + dx * t - x, ey = y0 + dy * t - y, rad = r0 + (r1 - r0) * t;
if (ex * ex + ey * ey <= rad * rad + 0.01) P(L, x, y, v);
}
}
// 1 像素直线
function line(L, x0, y0, x1, y1, v) {
x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
let e = dx + dy;
for (;;) { P(L, x0, y0, v); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function poly(L, pts, v) {
let y0 = 1e9, y1 = -1e9; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
const xs = [];
for (let i = 0; i < pts.length; i++) {
const a = pts[i], b = pts[(i + 1) % pts.length];
if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
}
xs.sort((p, q) => p - q);
for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] + 0.5); x++) P(L, x, y, v);
}
}
// 受光（左上→右下阴影）：沿 (dx,dy) 方向越出形状的像素换色
function shade(L, dx, dy, v, from) {
const S = [];
for (let i = 0; i < N; i++) {
const p = L[i]; if (!p || (from && from !== p)) continue;
const x = i % SW, y = (i / SW) | 0;
if (!G(L, x + dx, y + dy)) S.push(i);
}
for (const i of S) L[i] = v;
}
// 合成：先画 4 邻域外描边，再填色
function comp(L, tag, ring = K) {
if (ring) for (let i = 0; i < N; i++) {
if (L[i]) continue; const x = i % SW;
if ((x > 0 && L[i - 1]) || (x < SW - 1 && L[i + 1]) || (i >= SW && L[i - SW]) || (i < N - SW && L[i + SW])) { cv[i] = ring; own[i] = tag; }
}
for (let i = 0; i < N; i++) if (L[i]) { cv[i] = L[i]; own[i] = tag; }
free(L);
}
// 模板盖印（shear: 每行 x 偏移函数）
function stamp(t, x0, y0, tag, flip, shear) {
for (let y = 0; y < t.h; y++) {
const off = shear ? shear(y) : 0;
for (let x = 0; x < t.w; x++) {
const v = t.d[y * t.w + (flip ? t.w - 1 - x : x)]; if (!v) continue;
const X = x0 + x + off, Y = y0 + y;
if (X >= 0 && Y >= 0 && X < SW && Y < SH) { cv[Y * SW + X] = v; own[Y * SW + X] = tag; }
}
}
}
function recolor(tag, map, y0 = 0, y1 = SH - 1, x0 = 0, x1 = SW - 1) {
for (let y = Math.max(0, y0); y <= Math.min(SH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(SW - 1, x1); x++) {
const i = y * SW + x; if (own[i] === tag && map[cv[i]] !== undefined) cv[i] = map[cv[i]];
}
}
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

// =====================================================================
// 4. 鸭鸭本体
// =====================================================================
// o: { dy, lean, legs:'stand'|'walk0..3'|'sit'|'tuck'|'none', lift:[l,r],
//      head:'F'|'Q'|'P'|'U', hx, hy, neck(额外颈长), eyes:'open'|'half'|'closed'|'happy' }
// 返回几何信息供道具/服装使用。
function duck(X, o) {
const dy = o.dy || 0, lean = o.lean || 0, DX = o.dx || 0;
const bx = AX - 15 + DX, by = 52 + dy;               // 身体模板左上
const shear = y => R(lean * (23 - y) / 23);
// 腿
const legY = by + 24;
if (o.legs === "sit") stamp(FEET_SIT, bx, AY - 6, 1);
else if (o.legs !== "none") legs(bx + 1, legY, o.lift || [0, 0]);
// 颈：头底 → 身体颈根
const H = { F: HEAD_F, Q: HEAD_Q, P: HEAD_P, U: HEAD_U }[o.head || "F"];
let hx = (o.hx || 0), hy = (o.hy || 0) - (o.neck || 0);
if (Math.abs(X.wind) >= 0.6 && !o.noLean) hx -= sgn(X.wind) * (Math.abs(X.wind) >= 0.9 ? 2 : 1);
const nbx = bx + 14.5 + lean, nby = by;                // 颈根中心
const hx0 = R(AX - 8.5 + DX + hx + lean + (H.kind === "P" ? 1 : H.kind === "U" ? 2 : 0)), hy0 = R(31 + dy + hy + (H.kind === "P" ? 3 : H.kind === "U" ? 3 : 0));
const ntx = hx0 + H.neck, nty = hy0 + H.h - 1;
neck(ntx, nty, nbx, nby + 2);
stamp(BODY_F, bx, by, 2, false, shear);
stamp(H, hx0, hy0, 3);
eyes(H, hx0, hy0, o.eyes || "open");
const g = {
bx, by, lean, cx: bx + 15 + lean * 0.5, H, hx0, hy0,
top: [hx0 + H.top[0], hy0 + H.top[1]], bill: [hx0 + H.bill[0], hy0 + H.bill[1]],
neckBase: [nbx, by + 4], shL: [bx + 7 + R(lean * 0.7), by + 8], shR: [bx + 22 + R(lean * 0.7), by + 8],
chest: [bx + 15 + lean * 0.6, by + 11], belly: [bx + 15 + lean * 0.3, by + 15], bottom: by + 23,
};
return g;
}
function legs(x0, y0, lift) {
// 腿柱
const L = lay();
const cols = [[x0 + 7, lift[0]], [x0 + 18, lift[1]]];
for (const [lx, up] of cols) for (let y = y0; y <= y0 + 4 - up; y++) { P(L, lx, y, y === y0 ? O : o); P(L, lx + 1, y, y === y0 ? O : o); }
comp(L, 1);
stamp(FOOT_L, x0, y0 + 4 - lift[0] + (lift[1] > 0 && !lift[0] ? 1 : 0), 1);   // 右脚抬起时后脚落地
stamp(FOOT_R, x0 + 14, y0 + 4 - lift[1], 1);
}
function neck(x0, y0, x1, y1) {
const L = lay();
for (let y = y0; y <= y1; y++) {
const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0), cx = x0 + (x1 - x0) * t, l = R(cx - 3.5);
for (let x = l; x < l + 8; x++) P(L, x, y, x < l + 3 ? c : W);
if (y > y0) { const pc = x0 + (x1 - x0) * (y - 1 - y0) / (y1 - y0), pl = R(pc - 3.5); for (let x = Math.min(l, pl); x < Math.max(l, pl) + 8; x++) if (!G(L, x, y)) P(L, x, y, x < Math.max(l, pl) + 3 ? c : W); }
}
// 仅侧边描边（上下端由头/身体模板覆盖）
comp(L, 2);
}
function eyes(H, x0, y0, mode) {
for (const [ex, ey] of H.eyes) {
const X = x0 + ex, Y = y0 + ey, below = H.eyes.some(e => e[0] === ex && e[1] === ey + 1);
if (mode === "open") P(cv, X, Y, K);
else if (mode === "half") P(cv, X, Y, below ? C : K);
else if (mode === "closed") { if (!below) { P(cv, X, Y, K); if (cv[Y * SW + X - 1] === W) P(cv, X - 1, Y, K); } }
else if (mode === "happy") { if (below) { P(cv, X, Y, K); } else { P(cv, X - 1, Y, K); P(cv, X + 1, Y, K); } }
}
}
// 翅膀：肩 → 手（tip），w 粗细，raise 为上举形态（宽叶片）
function wing(sx, sy, tx, ty, opt = {}) {
const L = lay(), w = opt.w || 1;
if (opt.fold) { ell(L, sx, sy + 3, 3.6, 5.2, W); seg(L, sx, sy + 2, tx, ty, 3.4, 2.5, W); ell(L, tx, ty, 2.7, 2.4, W); }
else if (opt.fan) {  // 展开的羽扇：上缘光滑，下缘三片飞羽
const d = sgn(tx - sx) || 1, u = sy - ty;
poly(L, [[sx, sy], [sx + d * 5, sy - u * 0.5 - 1], [tx, ty], [tx - d, ty + 2], [sx + d * 8, sy - u * 0.3 + 2], [sx + d * 7, sy + 3],
[sx + d * 5, sy + 4], [sx + d * 4, sy + 6], [sx + d, sy + 7]], W);
ell(L, sx, sy + 3, 3, 4.4, W);
}
else {
ell(L, sx, sy + 3, 3 * w, 4.4, W);
const [ex, ey] = opt.elbow || [(sx + tx) / 2, (sy + 2 + ty) / 2];
seg(L, sx, sy + 2, ex, ey, 2.6 * w, 2.2 * w, W);
seg(L, ex, ey, tx, ty, 2.2 * w, 1.8 * w, W);
ell(L, tx, ty, 2.1 * w, 2 * w, W);
if (opt.feather) {   // 翼尖两根小飞羽，顺着前臂方向
const dx = tx - ex, dy = ty - ey, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
seg(L, tx, ty, tx + ux * 3.2 - uy * 1.2, ty + uy * 3.2 + ux * 1.2, 1, 0.5, W);
seg(L, tx, ty, tx + ux * 2.4 + uy * 1.6, ty + uy * 2.4 - ux * 1.6, 0.9, 0.4, W);
}
}
shade(L, -1, 1, c); shade(L, 0, 2, c);
const sleeve = opt.coat; if (sleeve) { for (let i = 0; i < N; i++) if (L[i]) L[i] = L[i] === W ? sleeve[0] : sleeve[1]; }
comp(L, 4);
}

// =====================================================================
// 5. 服装（帽 / 墨镜 / 围巾 / 外套 / 雨靴）
// =====================================================================
function dressBody(g, X) {
const u = X.out;
if (u.coat) {
const [m, d] = DUO[u.coatColor || "red"];
recolor(2, { [W]: m, [c]: d, [C]: d }, g.by + 4, g.bottom);
if (u.coat === "jacket") for (let y = g.by + 9; y < g.bottom - 1; y += 4) recolor(2, { [m]: d }, y, y);
else { P(cv, g.cx + 1, g.by + 10, K); P(cv, g.cx + 1, g.by + 14, K); }
// 下摆受风
const w = X.wind;
if (Math.abs(w) >= 0.25) {
const L = lay(), y = g.bottom - 3, s = sgn(w), ex = s > 0 ? g.bx + 27 : g.bx + 2;
const n = Math.abs(w) >= 0.8 ? 3 : 1;
poly(L, [[ex, y - 3], [ex + s * n, y - 1 + (X.f & 1)], [ex, y + 1]], m);
comp(L, 7);
}
}
if (u.boots) recolor(1, { [o]: DUO[u.bootColor || "red"][0], [O]: DUO[u.bootColor || "red"][1], [r]: DUO[u.bootColor || "red"][1] });
}
function scarf(g, X) {
const u = X.out; if (!u.scarf) return;
const [m, d] = DUO[u.scarf], L = lay();
const nx = g.neckBase[0], ny = g.neckBase[1] - 2;
rect(L, R(nx - 5), ny, R(nx + 4), ny + 2, m);
for (let x = R(nx - 5); x <= R(nx + 4); x += 3) P(L, x, ny + 1, d);
// 尾巴：静风下垂，受风朝下风向飘
const w = X.wind, s = sgn(w) || 1, a = Math.min(1, Math.abs(w));
const kx = nx + 3, ky = ny + 2, len = 7;
const ex = kx + s * a * len + (X.f % 2 ? s * a : 0), ey = ky + len * (1 - a * 0.85) + (a > 0.5 && X.f % 2 ? -1 : 0);
seg(L, kx, ky, ex, ey, 1.5, 1.2, m);
P(L, R((kx + ex) / 2), R((ky + ey) / 2), d);
comp(L, 6);
for (let y = ny + 3; y <= R(ey) + 2; y++) for (let x = R(Math.min(kx, ex)) - 3; x <= R(Math.max(kx, ex)) + 3; x++) if (own[y * SW + x] === 6) own[y * SW + x] = 7;   // 尾巴=受风件
if (a >= 0.5) { const L2 = lay(); P(L2, ex + s * 2, ey - 1, m); P(L2, ex + s * 2, ey + 1, m); comp(L2, 7); }
}
function hat(g, X, holdWing) {
const u = X.out, [hx, hy] = g.top, w = X.wind, kind = g.H.kind;
if (u.glasses && !X.night) {
const L = lay();
if (kind === "F" || kind === "Q") {
const e = g.H.eyes.filter(q => !g.H.eyes.some(p => p[0] === q[0] && p[1] === q[1] - 1));
for (const [ex, ey] of e) rect(L, g.hx0 + ex - 1, g.hy0 + ey, g.hx0 + ex + 1, g.hy0 + ey + 1, LENS);
if (e.length === 2) line(L, g.hx0 + e[0][0] + 2, g.hy0 + e[0][1], g.hx0 + e[1][0] - 2, g.hy0 + e[1][1], K);
} else { const [ex, ey] = g.H.eyes[0]; rect(L, g.hx0 + ex - 1, g.hy0 + ey, g.hx0 + ex + 1, g.hy0 + ey + 1, LENS); line(L, g.hx0 + ex - 2, g.hy0 + ey, g.hx0 + 1, g.hy0 + ey - 1, K); }
comp(L, 6, 0);
}
if (!u.hat) return;
const L = lay(), a = Math.min(1, Math.abs(w)), s = sgn(w);
const held = holdWing && a >= 0.7;
const tilt = held ? 0 : w * 0.22;                     // 上风侧帽檐被掀起
const ty = x => R((x - hx) * tilt);
if (u.hat === "sun") {
const [m, d] = DUO.straw;
for (let x = R(hx - 10); x <= R(hx + 10); x++) { P(L, x, hy + 3 + ty(x), m); if (Math.abs(x - hx) < 9) P(L, x, hy + 4 + ty(x), d); }
ell(L, hx, hy + 1.5, 5, 3.5, m);
for (let x = R(hx - 4); x <= R(hx + 4); x++) P(L, x, hy + 2 + ty(x), RED);
shade(L, -1, 1, d, m);
} else if (u.hat === "rain") {
const [m, d] = DUO[u.coatColor || "yellow"];
ell(L, hx, hy + 2, 5, 2.6, m);
for (let x = R(hx - 9); x <= R(hx + 9); x++) { P(L, x, hy + 4 + ty(x), d); if (x < hx - 3) P(L, x, hy + 5 + ty(x), m); }
shade(L, -1, 1, d, m);
} else if (u.hat === "knit") {
const [m, d] = DUO[u.hatColor || "red"];
ell(L, hx, hy + 2, 6.5, 4.5, m); rect(L, R(hx - 6), hy + 3, R(hx + 6), hy + 5, W);
for (let x = R(hx - 6); x <= R(hx + 6); x += 2) P(L, x, hy + 4, c);
for (let y = hy - 2; y < hy + 3; y++) if (y % 2) for (let x = R(hx - 6); x <= R(hx + 6); x++) if (L[y * SW + x] === m) L[y * SW + x] = (x + y) % 3 ? m : d;
const px = hx + s * a * 2.5, py = hy - 3 + (a > 0.6 ? 1 : 0);
const Tq = lay(); ell(Tq, px, py, 2, 2, W); P(Tq, px - 1, py + 1, c); comp(L, 6); comp(Tq, 7); return held;
} else if (u.hat === "earmuff") {
const [m, d] = DUO[u.hatColor || "pink"];
const half = g.H.w / 2;
for (let x = -half + 1; x <= half - 1; x++) { const yy = hy - 1 + R(Math.pow(Math.abs(x) / half, 2) * 4); P(L, hx + x, yy, DGRY); }
const e = g.H.eyes[0][1] + g.hy0;
ell(L, g.hx0 + 0.5, e + 1, 2.2, 2.6, m); ell(L, g.hx0 + g.H.w - 2.5, e + 1, 2.2, 2.6, m);
shade(L, -1, 1, d, m);
} else if (u.hat === "night") {
const [m, d] = DUO[u.hatColor || "blue"];
const tipx = hx - 8 + s * a * 10, tipy = hy + 2 - a * 3 + (X.f % 2 && a > 0.5 ? -1 : 0);
poly(L, [[hx - 6, hy + 3], [hx + 6, hy + 3], [hx + 3, hy - 2], [tipx, tipy]], m);
rect(L, R(hx - 6), hy + 3, R(hx + 6), hy + 4, W);
shade(L, -1, 1, d, m);
const Tq = lay(); ell(Tq, tipx, tipy, 1.6, 1.6, W); comp(L, 6); comp(Tq, 7); return held;
}
comp(L, 6);
return held;
}
// 强风且帽子在：返回压帽翅膀的手位
function hatHoldPoint(g) { return [g.top[0] + 2, g.top[1] + 1]; }

// =====================================================================
// 6. 道具
// =====================================================================
function stool(x, top) {
const L = lay();
rect(L, x - 9, top, x + 9, top + 1, WOOD);
for (let xx = x - 9; xx <= x + 9; xx++) P(L, xx, top + 2, DWOOD);
seg(L, x - 7, top + 3, x - 8.5, AY - 1, 0.6, 0.6, DWOOD); seg(L, x + 7, top + 3, x + 8.5, AY - 1, 0.6, 0.6, DWOOD);
rect(L, x - 7, R((top + AY) / 2) + 1, x + 7, R((top + AY) / 2) + 1, DWOOD);
comp(L, 5);
}
function mat(x0, x1, cols) {
const L = lay();
for (let x = x0; x <= x1; x++) for (let y = AY - 2; y <= AY - 1; y++) P(L, x, y, (((x - x0) >> 2) & 1) ? W : cols[0]);
for (let x = x0; x <= x1; x++) P(L, x, AY - 1, (((x - x0) >> 2) & 1) ? c : cols[1]);
comp(L, 5);
}
function awning(X) {
if (X.shared) return;   // 共享长雨棚由场景层用 canopy() 统一画
const L = lay(), [m, d] = DUO[X.out.awning || "red"], w = X.wind, f = X.f;
seg(L, AX - 25, 24, AX - 25, AY - 1, 0.6, 0.6, DWOOD); seg(L, AX + 25, 24, AX + 25, AY - 1, 0.6, 0.6, DWOOD);
comp(L, 5);
const T = lay();
poly(T, [[AX - 22, 15], [AX + 22, 15], [AX + 29, 23], [AX - 29, 23]], m);
for (let y = 15; y <= 23; y++) for (let x = AX - 30; x <= AX + 30; x++) if (T[y * SW + x] && (((x - AX + 40) >> 2) & 1)) T[y * SW + x] = W;
const ph = Math.sign(w) * R(Math.abs(w) * 1.5) + (Math.abs(w) > 0.5 ? f % 2 : 0);
const Fr = lay(), sh = Math.sign(w) * R(Math.abs(w) * 1.5);
for (let x = AX - 29; x <= AX + 29; x++) { const k = (x - AX + 40 + ph) % 4; if (k === 1 || k === 2) P(Fr, x + sh, 24, ((x - AX + 40) >> 2) & 1 ? W : m); }
for (let x = AX - 22; x <= AX + 22; x++) P(T, x, 15, d);
comp(T, 5); comp(Fr, 7);
// 檐口滴水（雨）
if (X.rain) { const D = lay(); for (const dx of [-27, -12, 4, 19]) { const yy = 27 + ((f * 3 + dx * 7) & 7); P(D, AX + dx + R(w * 2), yy, WATER); P(D, AX + dx + R(w * 2), yy + 1, WATER); } comp(D, 7, 0); }
}
function pond(cx, wide) {
const L = lay(); ell(L, cx, AY - 1.6, wide || 9, 1.4, WATER); for (let x = R(cx - 3); x <= R(cx); x++) P(L, x, AY - 2, W); comp(L, 5);
}
function snowGround(x0, x1) { const L = lay(); for (let x = x0; x <= x1; x++) { P(L, x, AY, W); P(L, x, AY - 1, W); P(L, x, AY - 2, W); if (((x * 7) % 11) < 5 && x > x0 + 1 && x < x1 - 1) P(L, x, AY - 3, W); } shade(L, -1, 1, SNOWS); comp(L, 5, 0); }
function mug(x, y, col, X) {
const L = lay(), [m, d] = DUO[col || "red"];
rect(L, x - 2, y - 2, x + 2, y + 3, m); for (let yy = y - 2; yy <= y + 3; yy++) P(L, x - 2, yy, d);
P(L, x + 3, y - 1, m); P(L, x + 4, y, m); P(L, x + 3, y + 1, m);
rect(L, x - 1, y - 2, x + 1, y - 2, B);
comp(L, 5);
steam(x, y - 4, X);
}
function steam(x, y, X) {
const L = lay(), w = X.wind, f = X.f;
for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) {
const t = (i + f + k * 2) % 6, yy = y - t * 1.6 - k, xx = x - 1 + k * 2 + Math.sin((t + k) * 1.3) * 0.8 + w * t * 1.3;
P(L, xx, yy, t > 3 ? LGRY : W);
}
comp(L, 7, 0);
}
function book(cx, cy, col, X, tilt) {
const L = lay(), [m, d] = DUO[col || "blue"];
poly(L, [[cx - 9, cy - 3 + tilt], [cx, cy - 1], [cx + 9, cy - 3 - tilt], [cx + 9, cy + 4 - tilt], [cx, cy + 6], [cx - 9, cy + 5 + tilt]], m);
poly(L, [[cx - 8, cy - 3 + tilt], [cx, cy - 1], [cx + 8, cy - 3 - tilt], [cx + 8, cy + 3 - tilt], [cx, cy + 5], [cx - 8, cy + 4 + tilt]], W);
for (let k = 0; k < 3; k++) { line(L, cx - 7, cy - 1 + k * 2 + tilt, cx - 2, cy + k * 2, c); line(L, cx + 2, cy + k * 2, cx + 7, cy - 1 + k * 2 - tilt, c); }
line(L, cx, cy - 1, cx, cy + 5, C);
for (let x = cx - 9; x <= cx + 9; x++) if (G(L, x, cy + 6) === m || G(L, x, cy + 5) === m) {}
comp(L, 5);
// 风吹翻页
const w = X.wind, a = Math.abs(w);
if (a >= 0.25) {
const s = sgn(w), P2 = lay(), up = a >= 0.8 ? 5 : 2, fl = (X.f % 2) ? 1 : 0;
poly(P2, [[cx, cy - 1], [cx + s * 7, cy - 2 - up - fl], [cx + s * 8, cy - up - fl], [cx + s * 1, cy + 1]], W);
comp(P2, 7);
}
}
function lamp(x) {
const L = lay();
rect(L, x - 3, AY - 1, x + 3, AY - 1, DGRY); seg(L, x, AY - 2, x, AY - 12, 0.5, 0.5, DGRY);
poly(L, [[x - 2, AY - 18], [x + 2, AY - 18], [x + 5, AY - 12], [x - 5, AY - 12]], YEL);
for (let xx = x - 5; xx <= x + 5; xx++) P(L, xx, AY - 12, DYEL);
comp(L, 5);
const G2 = lay(); for (let xx = x - 3; xx <= x + 3; xx++) P(G2, xx, AY - 11, GLOW); P(G2, x - 1, AY - 10, GLOW); P(G2, x + 1, AY - 10, GLOW); comp(G2, 5, 0);
}
function camera(cx, cy, X) {
const L = lay();
rect(L, cx - 5, cy - 3, cx + 5, cy + 3, DGRY); rect(L, cx - 4, cy - 5, cx - 1, cy - 4, DGRY);
ell(L, cx + 1, cy, 2.4, 2.4, K); P(L, cx + 1, cy - 1, BLUE); P(L, cx + 2, cy - 1, W);
for (let x = cx - 5; x <= cx + 5; x++) P(L, x, cy - 3, GRY);
P(L, cx + 4, cy - 2, RED);
comp(L, 5);
if (X.f === 2) { const F = lay(); P(F, cx + 3, cy - 7, W); P(F, cx + 3, cy - 9, W); P(F, cx + 2, cy - 8, W); P(F, cx + 4, cy - 8, W); P(F, cx + 3, cy - 8, YEL); comp(F, 5, 0); }
// 背带随风摆
const S = lay(), w = X.wind; const s0 = [cx - 5, cy + 2], e = [cx - 5 + w * 6, cy + 8 - Math.abs(w) * 3];
line(S, s0[0], s0[1], (s0[0] + e[0]) / 2 - 1, e[1], DGRY); line(S, (s0[0] + e[0]) / 2 - 1, e[1], cx + 3, cy + 3, DGRY);
comp(S, 7, 0);
}
function canWater(x, y, X) {
const L = lay();
rect(L, x - 4, y - 3, x + 3, y + 3, TEAL); for (let yy = y - 3; yy <= y + 3; yy++) P(L, x - 4, yy, DTEAL);
seg(L, x + 3, y + 1, x + 9, y - 2, 0.7, 0.7, TEAL); rect(L, x + 9, y - 3, x + 10, y - 2, DTEAL);
comp(L, 5);
const H = lay(); for (let t = 0; t <= 6; t++) { const a = Math.PI * (0.15 + t / 6 * 0.7); P(H, x - 1 + Math.cos(a) * 4, y - 4 - Math.sin(a) * 3, DTEAL); } comp(H, 5);
}
function waterStream(x, y, tx, ty, X) {
const L = lay(), w = X.wind;
for (let k = 0; k < 4; k++) { const t = ((k + X.f) % 4) / 4 + 0.12; P(L, x + (tx - x) * t + w * 3 * t, y + (ty - y) * t * t, WATER); P(L, x + (tx - x) * t + w * 3 * t + 1, y + (ty - y) * t * t + 1, WATER); }
comp(L, 7, 0);
}
function plant(x, kind) {
const L = lay();
poly(L, [[x - 4, AY - 6], [x + 4, AY - 6], [x + 3, AY - 1], [x - 3, AY - 1]], r);
rect(L, x - 4, AY - 7, x + 4, AY - 6, O);
comp(L, 5);
const S = lay();
if (kind === 1) { ell(S, x, AY - 12, 4, 4, GRN); ell(S, x - 1, AY - 13, 2, 2, LGRN); P(S, x + 2, AY - 14, RED); P(S, x - 2, AY - 10, RED); }
else { seg(S, x, AY - 7, x, AY - 13, 0.5, 0.5, DGRN); ell(S, x - 3, AY - 12, 2.5, 1.4, GRN); ell(S, x + 3, AY - 14, 2.5, 1.4, GRN); ell(S, x, AY - 16, 1.6, 2, LGRN); }
shade(S, -1, 1, DGRN, GRN);
comp(S, 5);
}
function snowman(x, big, X) {
const L = lay(), b = big ? 1.2 : 1, AY = 85;   // 雪人底边落在脚底行
ell(L, x, AY - 6 * b, 7 * b, 6 * b, W); ell(L, x, AY - 15.5 * b, 5 * b, 4.5 * b, W);
shade(L, -1, 1, SNOWS); shade(L, 0, 2, SNOWS);
comp(L, 5);
const F = lay(), hy = R(AY - 15.5 * b);
P(F, x - 1, hy - 1, K); P(F, x + 2, hy - 1, K); P(F, x + 1, hy + 1, o); P(F, x + 2, hy + 1, o); P(F, x + 3, hy + 1, O);
P(F, x, AY - 6 * b, K); P(F, x, AY - 3 * b, K);
line(F, x - 5 * b, AY - 8 * b, x - 9 * b, AY - 11 * b, DWOOD); P(F, x - 9 * b, AY - 12 * b, DWOOD);
comp(F, 5, 0);
if (X.out.snowmanScarf) { const S = lay(), [m] = DUO[X.out.snowmanScarf]; rect(S, R(x - 4 * b), R(hy + 3 * b), R(x + 4 * b), R(hy + 3 * b) + 1, m); seg(S, x - 3, hy + 4 * b, x - 3 + X.wind * 4, hy + 4 * b + 4 - Math.abs(X.wind) * 3, 0.8, 0.8, m); comp(S, 5); }
}
function snowPile(x, sz) { const L = lay(); ell(L, x, AY, sz, sz * 0.55, W); L.fill(0, AY * SW); shade(L, -1, 1, SNOWS); comp(L, 5); }
function broom(x0, y0, x1, y1, X) {
const L = lay(); seg(L, x0, y0, x1, y1, 0.6, 0.6, WOOD); comp(L, 5);
const H = lay(); const sk = X.f % 2 ? 1 : -1;
poly(H, [[x1 - 2, y1 - 1], [x1 + 2, y1 - 1], [x1 + 4 + sk, AY - 1], [x1 - 4 + sk, AY - 1]], STRAW);
for (let x = x1 - 4; x <= x1 + 4; x += 2) line(H, x1, y1, x + sk, AY - 1, DSTRAW);
rect(H, x1 - 2, y1 - 1, x1 + 2, y1, RED);
comp(H, 5);
}
function towel(x, y, X) {
const L = lay(), w = X.wind, s = sgn(w), a = Math.abs(w);
poly(L, [[x - 3, y - 2], [x + 3, y - 2], [x + 3 + s * a * 3, y + 5 - a * 2], [x - 3 + s * a * 3, y + 5 - a * 2 + (X.f & 1)]], BLUE);
for (let yy = y; yy <= y + 4; yy += 2) for (let xx = x - 4; xx <= x + 6; xx++) if (G(L, xx, yy) === BLUE) P(L, xx, yy, W);
comp(L, 7);
}
function umbrella(px, py, X, ang, col) {
// px,py 伞柄握点；ang 伞轴相对竖直的倾角（弧度，正 = 向右倾）
const [m, d] = DUO[col || "blue"];
const len = 31, tx = px + Math.sin(ang) * len, ty = py - Math.cos(ang) * len;
const S = lay(); line(S, px, py, tx, ty, DGRY); P(S, px, py + 1, DGRY); P(S, px, py + 2, DGRY); P(S, px + 1, py + 3, DGRY); P(S, px + 2, py + 2, DGRY);
for (let i = 0; i < N; i++) if (S[i] && !cv[i]) { cv[i] = S[i]; own[i] = 5; }   // 伞杆从头颈后方穿过
free(S);
const L = lay(), ca = Math.cos(ang), sa = Math.sin(ang), RX = 18, RY = 10;
for (let y = R(ty - 14); y <= R(ty + 14); y++) for (let x = R(tx - 21); x <= R(tx + 21); x++) {
const dx = x - tx, dy = y - ty, u = dx * ca + dy * sa, v = -dx * sa + dy * ca; // v 为伞轴方向（向下为正）
if (v > 0.5) continue;
if ((u * u) / (RX * RX) + ((v - 0.5) * (v - 0.5)) / (RY * RY) > 1) continue;
const k = ((u + RX) % 9 + 9) % 9;                 // 三片伞面之间的波浪边
if (v > -1.5 && Math.abs(k - 4.5) < 2.2 - (v + 1.5)) continue;
P(L, x, y, Math.abs(u) < 0.6 || Math.abs(Math.abs(u) - 9) < 0.6 ? d : m);
}
shade(L, 0, 1, d, m);
comp(L, 8);
const T = lay(); P(T, tx + sa * (RY + 1), ty - ca * (RY + 1), K); comp(T, 9, 0);
}
function furled(px, py, tx, ty, col) {
const L = lay(), [m, d] = DUO[col || "blue"];
seg(L, px, py, tx, ty, 2.2, 0.6, m); shade(L, -1, 1, d, m);
comp(L, 5);
const S = lay(); line(S, px, py, px - (tx - px) * 0.15, py - (ty - py) * 0.15, DGRY); comp(S, 5, 0);
}
function drops(pts) { const L = lay(); for (const [x, y] of pts) { P(L, x, y, WATER); P(L, x, y + 1, WATER); } comp(L, 5, 0); }
function flakes(pts) { const L = lay(); for (const [x, y] of pts) { P(L, x, y, W); } comp(L, 5, 0); }
function box(cx, cy, w2, h2) {
const L = lay(); rect(L, cx - w2, cy - h2, cx + w2, cy + h2, WOOD);
for (let x = cx - w2; x <= cx + w2; x++) P(L, x, cy - h2, STRAW);
line(L, cx, cy - h2, cx, cy - h2 + 2, DWOOD); shade(L, -1, 1, DWOOD, WOOD);
comp(L, 5);
}
function pottedHeld(cx, cy) {
const L = lay(); poly(L, [[cx - 4, cy - 2], [cx + 4, cy - 2], [cx + 3, cy + 4], [cx - 3, cy + 4]], r); rect(L, cx - 4, cy - 3, cx + 4, cy - 2, O); comp(L, 5);
const S = lay(); ell(S, cx - 3, cy - 6, 2.5, 1.5, GRN); ell(S, cx + 2, cy - 8, 2.5, 1.5, GRN); seg(S, cx, cy - 3, cx, cy - 9, 0.5, 0.5, DGRN); ell(S, cx, cy - 10, 1.4, 1.8, LGRN); shade(S, -1, 1, DGRN, GRN); comp(S, 5);
}
function warmer(cx, cy) {
const L = lay(); poly(L, [[cx - 5, cy - 4], [cx + 5, cy - 4], [cx + 6, cy + 4], [cx - 6, cy + 4]], RED); rect(L, cx - 2, cy - 7, cx + 2, cy - 5, DGRY);
for (let y = cy - 2; y <= cy + 3; y += 2) for (let x = cx - 6; x <= cx + 6; x++) if (G(L, x, y) === RED) P(L, x, y, PINK);
shade(L, -1, 1, DRED, RED); comp(L, 5);
}
function easel(x, X) {
const L = lay(); seg(L, x - 6, AY - 1, x - 1, AY - 34, 0.5, 0.5, DWOOD); seg(L, x + 6, AY - 1, x + 1, AY - 34, 0.5, 0.5, DWOOD); seg(L, x, AY - 20, x + 1, AY - 1, 0.4, 0.4, DWOOD); comp(L, 5);
const Cv = lay(); rect(Cv, x - 7, AY - 32, x + 7, AY - 19, W); rect(Cv, x - 8, AY - 18, x + 8, AY - 17, WOOD);
ell(Cv, x - 2, AY - 25, 3, 2, BLUE); ell(Cv, x + 3, AY - 23, 2.5, 2, GRN); P(Cv, x + 3, AY - 29, YEL); P(Cv, x + 4, AY - 29, YEL); P(Cv, x + 3, AY - 28, YEL);
for (let xx = x - 6; xx <= x + 6; xx++) P(Cv, xx, AY - 21, X.f > 1 ? GRN : LGRN);
comp(Cv, 5);
}
function footprints(x0, x1) { const L = lay(); for (let x = x0; x <= x1; x += 6) { P(L, x, AY, SNOWS); P(L, x + 1, AY, SNOWS); P(L, x + 3, AY - 1, SNOWS); } comp(L, 5, 0); }
function splash(cx, big) {
const L = lay(), k = big ? 1 : 0.6;
for (const [dx, dy] of [[-7, -3], [-5, -6], [-2, -4], [3, -5], [5, -7], [8, -3]]) P(L, cx + dx * k * 1.2, AY - 2 + dy * k, WATER);
comp(L, 5, 0);
}

// =====================================================================
// 7. 动作（本地坐标一律朝右；X = {f, wind(本地), out, fam, ph, rain, snow, night, shelter}）
// =====================================================================
const HOLD = (g, X, side) => side; // 占位，便于阅读
function stdDress(g, X, freeWing) {
dressBody(g, X); scarf(g, X);
return hat(g, X, freeWing);
}
function coatOf(X) { return X.out.coat ? DUO[X.out.coatColor || "red"] : null; }
// 空闲翅膀（贴身下垂）
function restWing(g, side, X) {
const s = side === "L" ? g.shL : g.shR, d = side === "L" ? -1 : 1;
wing(s[0] + d, s[1] + 1, s[0] + d * 2, s[1] + 10, { coat: coatOf(X), fold: true });
}
// 翼尖压在道具上（表现“握住”）
function tipOver(x, y, X) { const L = lay(), cc = coatOf(X); ell(L, x, y, 2, 1.8, cc ? cc[0] : W); shade(L, -1, 1, cc ? cc[1] : c); comp(L, 4); }
function holdHatWing(g, X) { const [x, y] = hatHoldPoint(g); wing(g.shR[0], g.shR[1], x + 3, y + 2, { coat: coatOf(X), feather: true }); }

const A = [];
const def = (id, name, meta, draw) => A.push(Object.assign({ id, name, draw, frames: 4, fps: 6, support: "ground", wind: "none", shelter: [] }, meta));
const ALLF = FAMILIES, DRY = ["sunny", "cloudy"], RAIN = ["lightRain", "heavyRain"], SNOW = ["lightSnow", "heavySnow"];
const DAYS = ["dawn", "day", "dusk"], ALLP = PHASES;

def("fish", "钓鱼", { families: DRY, phases: ["dawn", "day", "dusk"], support: "stool", wind: "line" }, X => {
const f = X.f;
stool(AX, 74);
pond(92, 11);
const g = duck(X, { dy: -1, legs: "sit", head: "Q", hx: 1, hy: 2, eyes: f === 3 ? "half" : "open" });
stdDress(g, X, false);
const rx0 = 58, ry0 = 68, tip = [94 + (f === 1 ? 1 : 0), 30 + (f === 1 ? 1 : 0)];
const L = lay(); line(L, rx0, ry0, tip[0], tip[1], DWOOD); line(L, rx0 + 1, ry0, tip[0] - 6, tip[1] + 6, DWOOD); P(L, rx0 - 1, ry0 + 1, K); P(L, rx0, ry0 + 1, K); comp(L, 5, 0);
// 鱼线：二次曲线，风使中段向下风弯
const bob = AY - 3 + (f === 2 ? 1 : 0), end = [92 + R(X.wind * 3), bob];
const ctl = [tip[0] + X.wind * 12, (tip[1] + bob) / 2];
const S = lay(); let px = tip[0], py = tip[1];
for (let t = 0.05; t <= 1.001; t += 0.05) { const x = (1 - t) * (1 - t) * tip[0] + 2 * (1 - t) * t * ctl[0] + t * t * end[0], y = (1 - t) * (1 - t) * tip[1] + 2 * (1 - t) * t * ctl[1] + t * t * end[1]; line(S, px, py, x, y, DGRY); px = x; py = y; }
comp(S, 7, 0);
const Bb = lay(); P(Bb, end[0], bob - 1, RED); P(Bb, end[0], bob, W); comp(Bb, 7);
wing(g.shL[0], g.shL[1], 59, 67, { coat: coatOf(X) });
wing(g.shR[0], g.shR[1], 64, 64, { coat: coatOf(X), feather: true });
});

def("coffee", "温饮", { families: ALLF, phases: ALLP, wind: "steam", shelter: ["lightRain", "heavyRain"] }, X => {
const f = X.f, sip = f === 1 || f === 2;
if (X.shelter) awning(X);
const g = duck(X, { head: "Q", hx: 1, hy: sip ? 1 : 0, eyes: sip ? "happy" : "open" });
const held = stdDress(g, X, true);
const mx = sip ? g.bill[0] + 1 : 64, my = sip ? g.bill[1] + 4 : 64;
if (held) holdHatWing(g, X); else restWing(g, "L", X);
wing(g.shR[0], g.shR[1], mx - 2, my + 2, { coat: coatOf(X), elbow: sip ? [g.shR[0] + 6, g.shR[1] + 2] : undefined });
mug(mx, my, X.out.mug, X);
tipOver(mx - 3, my + 2, X);
});

def("read", "看书", { families: ALLF, phases: ALLP, support: "stool", wind: "page", shelter: ["lightRain", "heavyRain", "heavySnow"] }, X => {
const f = X.f;
if (X.shelter) awning(X);
if (X.night) lamp(X.shelter ? 17 : 24);
stool(AX, 74);
const g = duck(X, { dy: -1, legs: "sit", head: "F", hy: 3, eyes: f === 2 ? "closed" : "half" });
stdDress(g, X, false);
const by = g.by + 11;
wing(g.shL[0], g.shL[1], AX - 10, by + 3, { coat: coatOf(X), elbow: [g.shL[0] - 2, g.shL[1] + 7] });
wing(g.shR[0], g.shR[1], AX + 10, by + 3, { coat: coatOf(X), elbow: [g.shR[0] + 2, g.shR[1] + 7] });
book(AX, by, X.out.book, X, f === 3 ? 1 : 0);
tipOver(AX - 10, by + 3, X); tipOver(AX + 10, by + 3, X);
});

def("photo", "拍照", { families: ["sunny", "cloudy", "lightSnow", "heavySnow"], phases: ALLP, wind: "strap", nightCover: true }, X => {
const f = X.f;
if (X.shelter) awning(X);
const g = duck(X, { head: "Q", hx: 3, hy: f === 3 ? 0 : 3, eyes: f === 3 ? "open" : f === 2 ? "closed" : "half" });
stdDress(g, X, false);
const cx = g.cx + 9, cy = g.by + 9 - (f === 1 ? 1 : 0);
wing(g.shL[0], g.shL[1], cx - 6, cy + 2, { coat: coatOf(X), elbow: [g.shL[0] + 1, g.shL[1] + 8] });
camera(cx, cy, X);
wing(g.shR[0], g.shR[1], cx + 5, cy + 2, { coat: coatOf(X), feather: true });
});

def("stretch", "伸懒腰", { families: ALLF, phases: ["dawn", "day", "night"], wind: "hat", shelter: ["lightRain", "heavyRain", "heavySnow"] }, X => {
const f = X.f, up = [0.4, 1, 1, 0.4][f], low = X.shelter ? 4 : 0;
if (X.shelter) awning(X);
const g = duck(X, { head: "F", neck: R(up * 3) - low, eyes: up > 0.5 ? "closed" : "half" });
stdDress(g, X, false);
const tyy = g.top[1] + 8 - up * 8 + low;
wing(g.shL[0], g.shL[1] - 1, AX - 13 - up * 3, tyy, { coat: coatOf(X), feather: true, elbow: [g.shL[0] - 6, g.shL[1] - 4] });
wing(g.shR[0], g.shR[1] - 1, AX + 13 + up * 3, tyy, { coat: coatOf(X), feather: true, elbow: [g.shR[0] + 6, g.shR[1] - 4] });
});

def("water", "浇花", { families: DRY, phases: ["dawn", "day", "dusk"], wind: "stream" }, X => {
const f = X.f;
plant(86, X.out.flower ? 1 : 0);
const g = duck(X, { head: "Q", hx: 3, hy: 2, eyes: "open", lean: 1 });
const held = stdDress(g, X, true);
const cx = 70, cy = 66 - (f === 1 ? 1 : 0);
canWater(cx, cy, X);
waterStream(cx + 10, cy - 2, 85, AY - 16, X);
if (held) holdHatWing(g, X); else restWing(g, "L", X);
wing(g.shR[0], g.shR[1], cx - 2, cy - 4, { coat: coatOf(X), feather: true });
});

def("gaze", "眺望", { families: ["sunny", "cloudy", "lightSnow", "heavySnow"], phases: ["dawn", "day", "dusk"], wind: "hat" }, X => {
const f = X.f, n = [2, 4, 5, 4][f];
const g = duck(X, { head: "P", hx: 2 + (n >> 1), neck: n, eyes: "open", lean: 1 });
stdDress(g, X, false);
restWing(g, "L", X);
wing(g.shR[0], g.shR[1], g.hx0 + 13, g.hy0 + 3, { coat: coatOf(X), feather: true, elbow: [g.shR[0] + 9, g.shR[1] - 3] });
});

def("skyward", "仰望", { families: ALLF, phases: ALLP, support: "ground", wind: "hat", shelter: ["lightRain", "heavyRain"] }, X => {
const f = X.f;
if (X.shelter) awning(X);
const g = duck(X, { dy: 4, legs: "sit", head: "U", hx: 1 + (f === 2 ? 1 : 0), hy: 0, lean: -2, eyes: f === 3 ? "closed" : "open" });
stdDress(g, X, false);
restWing(g, "L", X); restWing(g, "R", X);
if (X.snow && !X.shelter) flakes([[g.bill[0] + 2, g.bill[1] - 6 + f], [g.bill[0] - 6, g.bill[1] - 9 + f * 2]]);
});

def("walk", "散步", { families: ["sunny", "cloudy", "lightSnow", "heavySnow"], phases: ALLP, fps: 8, wind: "hat" }, X => {
const f = X.f, lift = [[0, 0], [3, 0], [0, 0], [0, 3]][f];
if (X.snow) footprints(8, 34);
const g = duck(X, { head: "Q", hx: 2, lift, eyes: "open", lean: f % 2 ? 1 : 0 });
const held = stdDress(g, X, true);
if (X.night && X.snow) holdUmb(g, X, false);
else { if (held) holdHatWing(g, X); else restWing(g, "R", X); restWing(g, "L", X); }
});

function holdUmb(g, X, keepL) {     // 伞面迎风；风从身后来时换左翼握伞，伞杆不穿脸
const ang = -X.wind * 0.45, left = ang > 0.1, sh = left ? g.shL : g.shR, d = left ? -1 : 1;
const px = sh[0] + 3 * d, py = sh[1] - 4;
umbrella(px, py, X, ang, X.out.umbrella);
wing(sh[0], sh[1], px, py + 1, { coat: coatOf(X), elbow: [sh[0] + 5 * d, sh[1] + 5] });
tipOver(px, py + 1, X);
if (left) { if (!keepL) restWing(g, "R", X); } else if (!keepL) restWing(g, "L", X);
return left;
}

def("umbrella", "撑伞", { families: ["lightRain", "heavyRain", "lightSnow"], phases: ALLP, fps: 8, wind: "umbrella" }, X => {
const f = X.f, lift = [[0, 0], [2, 0], [0, 0], [0, 2]][f];
const g = duck(X, { head: "Q", hx: 1, lift, eyes: "open" });
stdDress(g, X, false);
holdUmb(g, X, false);
});

def("hop", "踩水跳", { families: ["cloudy", "lightRain", "lightSnow"], phases: ["dawn", "day", "dusk"], wind: "coat" }, X => {
const f = X.f, h = [0, 5, 2, 0][f];
if (X.rain) pond(AX, 14); else if (X.snow) snowGround(AX - 16, AX + 16);
if (f === 3 && X.rain) splash(AX, 1); if (f === 3 && X.snow) flakes([[AX - 10, AY - 3], [AX + 9, AY - 4], [AX - 6, AY - 6], [AX + 5, AY - 7]]);
if (!X.rain && !X.snow) { const Sh = lay(); ell(Sh, AX, AY - 0.4, 9 - h, 0.9, SNOWS); comp(Sh, 5, 0); }
const g = duck(X, { head: "F", dy: -h, lift: h ? [h, h] : [0, 0], eyes: h ? "happy" : "open", neck: f === 1 ? 2 : 0 });
stdDress(g, X, false);
const up = h > 3, wy = up ? 6 : 1;
wing(g.shL[0], g.shL[1], g.shL[0] - 10, g.shL[1] - wy, { coat: coatOf(X), fan: true });
wing(g.shR[0], g.shR[1], g.shR[0] + 10, g.shR[1] - wy, { coat: coatOf(X), fan: true });
});

def("snowman", "堆雪人", { families: SNOW, phases: ["dawn", "day", "dusk"], wind: "scarf" }, X => {
const f = X.f;
snowGround(30, 100);
const big = X.fam === "heavySnow", b = big ? 1.2 : 1;
snowman(84, big, X);
const g = duck(X, { head: "Q", hx: 3, hy: 1, eyes: f === 2 ? "happy" : "open", lean: 2 });
stdDress(g, X, false);
restWing(g, "L", X);
const tx = R(84 - 5 * b - 1) - (f === 1 ? 1 : 0), ty = R(AY - 1 - 15.5 * b) - (f === 1 ? 2 : 0);
wing(g.shR[0], g.shR[1], tx, ty, { coat: coatOf(X), feather: true });
});

def("sweep", "扫雪", { families: SNOW, phases: ["dawn", "day", "dusk"], wind: "scarf" }, X => {
const f = X.f, sw = [0, 3, 5, 3][f];
snowGround(20, 100); snowPile(92, 7);
const g = duck(X, { head: "Q", hx: 2, hy: 2, lean: 2, eyes: "open" });
stdDress(g, X, false);
const bx1 = 74 + sw, by1 = AY - 6;
broom(58, 54, bx1, by1, X);
if (f === 2) flakes([[bx1 + 6, AY - 4], [bx1 + 8, AY - 7], [bx1 + 5, AY - 9]]);
wing(g.shL[0], g.shL[1], 59, 57, { coat: coatOf(X) });
wing(g.shR[0], g.shR[1], 64 + sw * 0.5, 64, { coat: coatOf(X), feather: true });
});

def("catch", "接雨雪", { families: ["lightRain", "lightSnow", "heavySnow"], phases: ["dawn", "day", "dusk"], wind: "hat" }, X => {
const f = X.f;
const g = duck(X, { head: "Q", hx: 3, hy: 1, eyes: f === 3 ? "happy" : "open" });
stdDress(g, X, false);
restWing(g, "L", X);
const hx = 74, hy = 61;
wing(g.shR[0], g.shR[1], hx, hy, { coat: coatOf(X), feather: true, elbow: [g.shR[0] + 5, g.shR[1] + 4] });
const pts = [[hx + 1, hy - 14 + f * 3], [hx - 3, hy - 22 + f * 4], [hx + 4, hy - 9 + f * 2]];
if (X.rain) drops(pts); else flakes(pts);
if (f === 3) (X.rain ? drops : flakes)([[hx, hy - 3], [hx - 2, hy - 3]]);
});

def("wipe", "擦椅子", { families: ["lightRain", "heavyRain", "lightSnow", "heavySnow"], phases: ALLP, wind: "towel", shelter: ["heavyRain"] }, X => {
const f = X.f, dx = [0, 3, 6, 3][f];
if (X.shelter) awning(X);
stool(70, 74);
if (X.snow) { const L = lay(); for (let x = 63 + dx; x <= 78; x++) P(L, x, 73, W); comp(L, 5); }
const g = duck(X, { head: "Q", hx: 3, hy: 4, lean: 3, eyes: "open", dx: -6 });
stdDress(g, X, false);
towel(64 + dx, 72, X);
if (f === 2) (X.rain ? drops : flakes)([[80, 70], [82, 67]]);
restWing(g, "L", X);
wing(g.shR[0], g.shR[1], 64 + dx, 69, { coat: coatOf(X), feather: true });
});

def("shake", "抖伞", { families: RAIN, phases: ALLP, wind: "none", shelter: ["heavyRain"] }, X => {
const f = X.f, d = [0, -3, 0, 2][f];
if (X.shelter) awning(X);
const g = duck(X, { head: "Q", hx: 2, hy: 2, eyes: f === 1 ? "closed" : "open" });
stdDress(g, X, false);
furled(66, 62 + d, 84, 82 + d, X.out.umbrella);
if (f === 1 || f === 3) drops([[88, 78 + d], [86, 72 + d], [91, 82 + d]]);
restWing(g, "L", X);
wing(g.shR[0], g.shR[1], 66, 62 + d, { coat: coatOf(X), feather: true });
});

def("warm", "抱暖袋", { families: ["heavyRain", "lightSnow", "heavySnow", "cloudy"], phases: ["dawn", "dusk", "night"], wind: "scarf", shelter: ["heavyRain"] }, X => {
const f = X.f;
if (X.shelter) awning(X);
const g = duck(X, { head: "F", hy: 2, eyes: f === 1 || f === 2 ? "happy" : "half", lean: f === 2 ? 1 : 0 });
stdDress(g, X, false);
wing(g.shL[0], g.shL[1], AX - 6, 67, { coat: coatOf(X) });
wing(g.shR[0], g.shR[1], AX + 6, 67, { coat: coatOf(X) });
warmer(AX, 65);
if (f >= 1) steam(AX, 56, X);
tipOver(AX - 6, 67, X); tipOver(AX + 6, 67, X);
});

def("carry", "搬东西", { families: ALLF, phases: ["dawn", "day", "dusk", "night"], fps: 8, wind: "none", shelter: ["heavyRain"] }, X => {
const f = X.f, lift = [[0, 0], [2, 0], [0, 0], [0, 2]][f];
if (X.shelter) awning(X);
const g = duck(X, { head: "Q", hx: 1, hy: 1, lift, eyes: "open" });
stdDress(g, X, false);
const cy = 65 + (f % 2 ? -1 : 0);
wing(g.shL[0], g.shL[1], AX - 8, cy + 4, { coat: coatOf(X) });
wing(g.shR[0], g.shR[1], AX + 10, cy + 4, { coat: coatOf(X) });
if (X.rain) pottedHeld(AX + 1, cy); else box(AX + 1, cy, 9, 6);
tipOver(AX - 8, cy + 4, X); tipOver(AX + 10, cy + 4, X);
});

def("scarfFix", "理围巾", { families: ["cloudy", "lightSnow", "heavySnow", "heavyRain"], phases: ALLP, wind: "scarf", shelter: ["heavyRain"] }, X => {
const f = X.f;
if (X.shelter) awning(X);
const g = duck(X, { head: "F", hy: f === 1 ? 1 : 0, eyes: f === 2 ? "happy" : "open" });
stdDress(g, X, false);
const ny = g.neckBase[1] - 1, nx = g.neckBase[0];
const lx = nx - 5, ly = ny + (f === 1 ? 1 : 0), rx = nx + 5, ry = ny - (f === 3 ? 1 : 0);
wing(g.shL[0], g.shL[1], lx, ly, { coat: coatOf(X), elbow: [g.shL[0] - 3, g.shL[1] + 7] });
wing(g.shR[0], g.shR[1], rx, ry, { coat: coatOf(X), elbow: [g.shR[0] + 3, g.shR[1] + 7] });
tipOver(lx, ly, X); tipOver(rx, ry, X);
});

def("sketch", "写生", { families: DRY, phases: ["dawn", "day", "dusk"], wind: "hat" }, X => {
const f = X.f;
easel(86, X);
const g = duck(X, { head: "Q", hx: 2, hy: 1, eyes: f === 1 ? "half" : "open", dx: -4 });
stdDress(g, X, false);
const bx = 76 + (f === 2 ? 1 : 0), by = 60 + (f === 1 ? -2 : 0);
const L = lay(); line(L, bx - 6, by + 3, bx, by, DWOOD); P(L, bx + 1, by, BLUE); comp(L, 5, 0);
restWing(g, "L", X);
wing(g.shR[0], g.shR[1], bx - 6, by + 3, { coat: coatOf(X), feather: true });
});

def("doze", "打盹", { families: ALLF, phases: ["day", "dusk", "night"], support: "stool", wind: "flutter", shelter: ["lightRain", "heavyRain", "heavySnow"] }, X => {
const f = X.f;
if (X.shelter) awning(X);
if (X.night && !X.shelter) lamp(22);
stool(AX, 74);
const g = duck(X, { dy: -1, legs: "sit", head: "F", hy: [5, 6, 6, 5][f], eyes: "closed", noLean: true });
stdDress(g, X, false);
if (f === 2) { const L = lay(); ell(L, g.bill[0] + 5, g.bill[1] - 1, 2, 2, WATER); P(L, g.bill[0] + 4, g.bill[1] - 2, W); comp(L, 5); }
wing(g.shL[0], g.shL[1], g.shL[0] + 2, g.shL[1] + 9, { coat: coatOf(X) });
wing(g.shR[0], g.shR[1], g.shR[0] - 2, g.shR[1] + 9, { coat: coatOf(X) });
});

// ---- 复用原素材帧的动作（见第 8 节数据区） ----
def("sunbathe", "开摆晒太阳", { families: ["sunny"], phases: ["day"], support: "mat", wind: "none", embed: "slump", frames: 2, fps: 3 }, X => {
mat(AX - 22, AX + 22, DUO[X.out.matColor || "red"]);
embed("slump", X.f, -2);
if (X.out.glasses) glassesAt(EMB.slump.eyes[X.f % 2], -2);
});
def("nap", "睡觉", { families: ALLF, phases: ["day", "night"], support: "ground", wind: "none", embed: "sleep", shelter: ["lightRain", "heavyRain", "heavySnow"] }, X => {
if (X.shelter) awning(X);
if (X.snow && !X.shelter) snowGround(AX - 28, AX + 28);
embed("sleep", X.f, 0);
if (X.night && (X.rain || X.snow)) {   // 雨雪夜：盖上格子小被
const [m, d] = DUO[X.out.quilt || "blue"], top = AY - 13;
for (let y = top; y < AY; y++) for (let x = 0; x < SW; x++) {
const i = y * SW + x; if (!cv[i] || own[i] !== 2) continue;
const edge = !cv[i - SW] || cv[i - SW] === K || !cv[i - 1] || !cv[i + 1];
cv[i] = edge && cv[i] === K ? K : y === top ? K : y === top + 1 ? W : (y - top) % 5 === 3 ? d : m;
}
}
});
def("melon", "吃瓜", { families: DRY, phases: ["day", "dusk"], support: "mat", wind: "none", embed: "melon" }, X => {
mat(AX - 20, AX + 20, DUO[X.out.matColor || "green"]);
embed("melon", X.f, -2);
});
def("lounge", "仰躺", { families: ["sunny", "cloudy"], phases: ["day", "dusk"], support: "mat", wind: "none", embed: "lie", frames: 2, fps: 3 }, X => {
mat(AX - 26, AX + 26, DUO[X.out.matColor || "blue"]);
embed("lie", X.f, -2);
});

// =====================================================================
// 8. 原素材降采样帧（数据区，调色板索引 + RLE + base64）
// =====================================================================
// 由 build.py 生成：08 开摆(f2,f4) / 15 晚安(f1-4) / 19 吃瓜(f1-4) / 08 仰躺(f1, f3 镜像)
const EMB = {};
function b64(s) {
if (typeof atob === "function") { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; }
return Uint8Array.from(Buffer.from(s, "base64"));
}
function unpack(e) {
const u = b64(e.d), out = new Uint8Array(e.w * e.h); let p = 0;
for (let i = 0; i < u.length; i++) { const v = u[i] & 63, k = u[i] >> 6; const n = k < 3 ? k + 1 : u[++i] + 4; out.fill(v, p, p + n); p += n; }
return out;
}
function installEmbeds(raw) {
  const names = ["slump", "sleep", "melon", "lie"];
  if (!raw || !names.every(k => Array.isArray(raw[k]?.frames) && raw[k].frames.length)) return false;
  for (const k of names) EMB[k] = { frames: raw[k].frames.map(e => ({ w: e.w, h: e.h, x: e.x, y: e.y, px: unpack(e) })), eyes: raw[k].eyes || [] };
  return true;
}

function embed(name, f, dy) {
const entry = EMB[name];
if (!entry) return;
const fr = entry.frames[f % entry.frames.length];
for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
const v = fr.px[y * fr.w + x]; if (!v) continue;
const X = AX - 32 + fr.x + x, Y = AY - 60 + fr.y + y + dy;
if (X >= 0 && Y >= 0 && X < SW && Y < SH) { cv[Y * SW + X] = v; own[Y * SW + X] = 2; }
}
}
function glassesAt(e, dy) {
if (!e) return; const L = lay(), x0 = AX - 32, y0 = AY - 60 + dy;
for (const [ex, ey] of e) rect(L, x0 + ex - 1, y0 + ey, x0 + ex + 1, y0 + ey + 1, LENS);
if (e.length === 2) line(L, x0 + e[0][0] + 2, y0 + e[0][1], x0 + e[1][0] - 2, y0 + e[1][1], K);
comp(L, 6, 0);
}

// =====================================================================
// 9. 服装搭配
// =====================================================================
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];
function outfit(actionId, family, phase, rand) {
rand = rand || Math.random;
const u = { hat: null, glasses: false, scarf: null, coat: null, coatColor: null, boots: false, bootColor: null, hatColor: null,
mug: pick(rand, ["red", "blue", "teal", "yellow", "purple"]), book: pick(rand, ["blue", "red", "green", "purple", "teal"]),
umbrella: pick(rand, ["blue", "red", "teal", "yellow", "purple", "green"]), awning: pick(rand, ["red", "blue", "teal", "green"]),
matColor: pick(rand, ["red", "blue", "green", "teal"]), flower: rand() < 0.5, snowmanScarf: pick(rand, ["red", "blue", "green", null]) };
const night = phase === "night", p = rand();
const embedOnly = ["nap", "melon", "lounge", "sunbathe"].includes(actionId);
if (embedOnly) { u.glasses = actionId === "sunbathe" && rand() < 0.7; u.quilt = pick(rand, ["blue", "purple", "teal", "red"]); return u; }
if (family === "sunny") {
if (!night) { if (p < 0.4) u.hat = "sun"; if (phase === "day" && rand() < 0.35 && actionId !== "photo" && actionId !== "read") u.glasses = true; }
else if (rand() < 0.35 && ["doze", "read", "stretch", "coffee"].includes(actionId)) { u.hat = "night"; u.hatColor = pick(rand, ["blue", "purple", "teal"]); }
} else if (family === "cloudy") {
if (night && rand() < 0.3 && ["doze", "read", "stretch", "coffee"].includes(actionId)) { u.hat = "night"; u.hatColor = pick(rand, ["blue", "purple", "teal"]); }
else if (!night && p < 0.18) u.hat = "sun";
if (rand() < (night || phase === "dusk" ? 0.35 : 0.12) || actionId === "scarfFix" || actionId === "warm") u.scarf = pick(rand, ["red", "blue", "teal", "purple", "green"]);
} else if (family === "lightRain" || family === "heavyRain") {
const heavy = family === "heavyRain";
u.coatColor = pick(rand, ["red", "blue", "teal", "yellow", "green"]);
if (rand() < (heavy ? 0.8 : 0.55) || actionId === "hop") u.coat = "raincoat";
if (rand() < (heavy ? 0.5 : 0.35) || actionId === "hop") u.hat = "rain";
if (rand() < 0.6 || actionId === "hop") { u.boots = true; u.bootColor = pick(rand, ["red", "blue", "green", "teal"]); }
if (actionId === "scarfFix" || actionId === "warm") u.scarf = pick(rand, ["red", "blue", "teal", "purple", "green"]);
} else {
const heavy = family === "heavySnow";
if (rand() < (heavy ? 0.85 : 0.65) || actionId === "scarfFix") u.scarf = pick(rand, ["red", "blue", "teal", "purple", "green"]);
const q = rand();
if (q < (heavy ? 0.5 : 0.4)) { u.hat = "knit"; u.hatColor = pick(rand, ["red", "blue", "green", "purple", "teal"]); }
else if (q < (heavy ? 0.75 : 0.6)) { u.hat = "earmuff"; u.hatColor = pick(rand, ["pink", "red", "blue", "purple"]); }
if (rand() < (heavy ? 0.4 : 0.2)) { u.coat = "jacket"; u.coatColor = pick(rand, ["red", "blue", "teal", "green", "purple"]); }
if (heavy && rand() < 0.3) { u.boots = true; u.bootColor = pick(rand, ["red", "blue", "green"]); }
}
const wet = family !== "sunny" && family !== "cloudy";
if (night && wet) { if (family.endsWith("Rain")) u.coat = "raincoat"; else if (!u.scarf) u.scarf = pick(rand, ["red", "blue", "teal", "purple", "green"]); }
if (actionId === "doze" && !u.hat && !u.scarf) { u.hat = night ? "night" : wet ? (family.endsWith("Rain") ? "rain" : "knit") : "sun"; u.hatColor = u.hatColor || pick(rand, ["blue", "purple", "teal"]); }
if (night) u.glasses = false;
return u;
}

// =====================================================================
// 10. 渲染入口
// =====================================================================
const BY_ID = {}; for (const a of A) BY_ID[a.id] = a;
const ACTIONS = A.map(a => ({ id: a.id, name: a.name, families: a.families.slice(), phases: a.phases.slice(), frames: a.frames, fps: a.fps, support: a.support, wind: a.wind, shelter: a.shelter.slice(), nightShelter: !!(a.shelter.length || a.nightCover), source: a.embed ? "original" : "drawn" }));
const covered = (a, fam, ph) => a.shelter.includes(fam) || (ph === "night" && fam !== "sunny" && fam !== "cloudy" && (a.shelter.length > 0 || a.nightCover));
function support(actionId, family, phase) { const a = BY_ID[actionId]; return a && covered(a, family, phase) ? "awning" : a ? a.support : null; }
function render(o) {
const a = BY_ID[o.action]; if (!a) throw new Error("unknown action " + o.action);
const facing = o.facing < 0 ? -1 : 1;
let wind = Math.max(-1, Math.min(1, +o.wind || 0)); wind = Math.round(wind * 4) / 4;   // 9 档
const fam = o.family || a.families[0], ph = o.phase || "day";
cv = new Uint8Array(N); own = new Uint8Array(N);
const X = { f: ((o.frame | 0) % a.frames + a.frames) % a.frames, wind: wind * facing, out: o.outfit || outfit(a.id, fam, ph, () => 0.5), fam, ph,
rain: fam === "lightRain" || fam === "heavyRain", snow: fam === "lightSnow" || fam === "heavySnow", night: ph === "night", shelter: covered(a, fam, ph), shared: o.sharedShelter === true };
a.draw(X);
let px = cv, tg = own;
if (facing < 0) { px = new Uint8Array(N); tg = new Uint8Array(N); for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { px[y * SW + SW - 1 - x] = cv[y * SW + x]; tg[y * SW + SW - 1 - x] = own[y * SW + x]; } }
cv = own = null;
const r = { w: SW, h: SH, px, ax: AX, ay: AY };
if (o.tags) r.tags = tg;   // 调试：每格图层标签（5 道具，6 衣饰）
return r;
}

// 共享长雨棚：与 awning 同风格，坐标沿用 awning 的 y（顶面 15..23、垂边 24、脚底 AY）整体上移 CY 行。
// width = 檐口总宽（格）；posts = 中间立柱的 x（相对左檐端，可省略则每 ≤140 格均分）；ax = 左檐端，ay = 脚底行。
function canopy(o) {
const width = Math.max(30, Math.min(1600, Math.round(+o.width || 60))), PAD = 4, CY = 11,
w = Math.round(Math.max(-1, Math.min(1, +o.wind || 0)) * 4) / 4, f = ((o.frame | 0) % 4 + 4) % 4,
[m, d] = DUO[DUO[o.color] && ["red", "blue", "teal", "green"].includes(o.color) ? o.color : "red"],
CW = width + PAD * 2 + 1, CHh = AY - CY + 1, px = new Uint8Array(CW * CHh), x0 = PAD;
const S = (x, y, v) => { x = R(x); y = R(y) - CY; if (x >= 0 && y >= 0 && x < CW && y < CHh) px[y * CW + x] = v; };
// 小画布上的分层合成（4 邻域 K 描边），与 comp 同规则
const layer = () => new Map();
const put = (Ly, x, y, v) => Ly.set(R(x) + "," + R(y), v);
const flush = (Ly, ring) => {
if (ring) for (const k of Ly.keys()) {
const [x, y] = k.split(",").map(Number);
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!Ly.has(x + dx + "," + (y + dy))) S(x + dx, y + dy, K);
}
for (const [k, v] of Ly) { const [x, y] = k.split(",").map(Number); S(x, y, v); }
};
// 立柱
let posts = Array.isArray(o.posts) ? o.posts.map(p => R(+p)).filter(p => p > 10 && p < width - 10) : null;
if (!posts) { posts = []; const n = Math.ceil((width - 8) / 140); for (let i = 1; i < n; i++) posts.push(R(4 + (width - 8) * i / n)); }
const P1 = layer();
for (const px0 of [4, width - 4, ...posts]) for (let y = 24; y <= AY - 1; y++) put(P1, x0 + px0, y, DWOOD);
flush(P1, true);
// 顶面梯形 + 条纹；上沿暗色、下沿檐线压暗
const T = layer();
for (let y = 15; y <= 23; y++) {
const k = (y - 15) / 8, a = 7 * (1 - k), b = width - 7 * (1 - k);
for (let x = Math.ceil(a - 0.5); x <= Math.floor(b + 0.5); x++) {
const st = ((x + 2) >> 2) & 1;
put(T, x0 + x, y, y === 15 ? d : y === 23 ? (st ? c : d) : st ? W : m);
}
}
flush(T, true);
// 垂边（随风摆动：带符号风向偏移，强风时逐帧换相）
const ph = Math.sign(w) * R(Math.abs(w) * 1.5) + (Math.abs(w) > 0.5 ? f % 2 : 0), sh = Math.sign(w) * R(Math.abs(w) * 1.5), Fr = layer();
for (let x = 0; x <= width; x++) { const k = (((x + 40 + ph) % 4) + 4) % 4; if (k === 1 || k === 2) put(Fr, x0 + x + sh, 24, ((x + 2) >> 2) & 1 ? W : m); }
flush(Fr, true);
// 顶面积雪
if (o.snow) {
const Sn = layer();
for (let x = 7; x <= width - 7; x++) {
put(Sn, x0 + x, 14, (x * 5) % 9 < 2 ? SNOWS : W); put(Sn, x0 + x, 13, W);
if ((x * 7) % 11 < 5 && x > 9 && x < width - 9) put(Sn, x0 + x, 12, W);
}
for (const e of [6, width - 6]) put(Sn, x0 + e, 14, SNOWS);
flush(Sn, true);
}
// 檐口滴水（雨）
if (o.rain) for (let dx = 2; dx <= width - 2; dx += 15) {
const j = (dx * 7) % 5, yy = 27 + ((f * 3 + dx * 7) & 7), xx = x0 + dx + j + R(w * 2);
S(xx, yy, WATER); S(xx, yy + 1, WATER);
}
return { w: CW, h: CHh, px, ax: x0, ay: AY - CY, posts: [4, width - 4, ...posts].sort((p, q) => p - q) };
}

return { PALETTE, FAMILIES, PHASES, ACTIONS, outfit, render, support, canopy, installEmbeds, SIZE: { w: SW, h: SH, ax: AX, ay: AY } };
})();
