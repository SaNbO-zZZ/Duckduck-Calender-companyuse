"""第二轮复核（重跑）：风独立、方向、太阳位置、降级、生命周期、导出命名、实时帧率。输出 JSON 到 /tmp/duck3/verify.json"""
import json, sys, time, threading, functools, http.server, socketserver, shutil, os
import numpy as np
from playwright.sync_api import sync_playwright

SRC = "/Users/xz/Desktop/鸭鸭日历.html"
WORK = "/tmp/duck3"
os.makedirs(WORK + "/www", exist_ok=True)
shutil.copy(SRC, WORK + "/www/index.html")
open(WORK + "/www/other.html", "w").write("<p>other</p>")
FILE_URL = "file://" + SRC
WEATHERS = ["clear", "partly", "overcast", "lightRain", "heavyRain", "storm", "lightSnow", "snow", "heavySnow"]
out = {"errors": []}


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=WORK + "/www")
    h.log_message = lambda *a: None
    srv = socketserver.TCPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def ctx_for(b, dev, **kw):
    if dev == "desk":
        return b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, accept_downloads=True, **kw)
    return b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, accept_downloads=True, **kw)


def open_page(ctx, url=FILE_URL, tag=""):
    p = ctx.new_page()
    p.on("pageerror", lambda e: out["errors"].append(f"{tag} pageerror {e}"))
    p.on("console", lambda m: m.type == "error" and out["errors"].append(f"{tag} console {m.text}"))
    p.goto(url)
    p.wait_for_function("window.duckReview && duckReview.state().canvas[0] > 0", timeout=15000)
    p.wait_for_timeout(500)
    return p


def st(p):
    return p.evaluate("(() => { const s = duckReview.state(); delete s.drops; return s; })()")


def gray(p, x, y, w, h):
    a = np.array(p.evaluate(f"duckReview.readGray({x},{y},{w},{h})"), dtype=np.float32).reshape(h, w)
    return a[::-1]  # 改为图像坐标（上为 0）


def shift(a, b):
    """相位相关：返回 b 相对 a 的 (dx, dy)，图像坐标，dy>0 向下"""
    a = a - a.mean(); b = b - b.mean()
    win = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    F = np.fft.fft2(a * win); G = np.fft.fft2(b * win)
    R = G * np.conj(F); R /= np.abs(R) + 1e-9
    r = np.fft.ifft2(R).real
    dy, dx = np.unravel_index(np.argmax(r), r.shape)
    h, w = a.shape
    if dy > h // 2: dy -= h
    if dx > w // 2: dx -= w
    return int(dx), int(dy), float(r.max())


def prep(p, w, lv, d, t="noon"):
    p.evaluate(f"duckReview.pause(); duckReview.setDate('2026-10-08'); duckReview.setTime('{t}'); duckReview.setWeather('{w}'); duckReview.setWind('{lv}', {d}); duckReview.resetMotion()")


def motion(p, w, lv, d, region, dt):
    prep(p, w, lv, d)
    x, y, ww, hh = region
    a = gray(p, x, y, ww, hh)
    p.evaluate(f"duckReview.advance({dt})")
    b = gray(p, x, y, ww, hh)
    return shift(a, b)


with sync_playwright() as pw:
    port = serve()
    b = pw.chromium.launch(channel="chrome", headless=True)

    # ---------- 1. 风独立 + 文案 ----------
    ctx = ctx_for(b, "desk"); p = open_page(ctx, tag="desk")
    ind = []
    for w in WEATHERS:
        row = {"weather": w}
        for lv in ["breeze", "normal", "strong"]:
            prep(p, w, lv, 1)
            s = st(p)
            row[lv] = {"cloud": round(s["cloudCover"], 3), "pill": s["pill"], "wind": round(s["wind"], 1), "slope": round(s["slope"], 3)}
        row["cloudSame"] = len({row[k]["cloud"] for k in ["breeze", "normal", "strong"]}) == 1
        ind.append(row)
    out["independence"] = ind
    body = p.evaluate("document.body.innerText")
    out["copy"] = {"cta": "臣妾做不到啊😭" in body, "category": "今天不想上班" in body, "demo": "演示" in body,
                   "secretsLike": p.evaluate("/(app_secret|access_token|tenant_access|Bearer )/i.test(document.documentElement.outerHTML)")}

    # ---------- 2. 运动方向（相位相关，单位：设备像素） ----------
    cw, chh = st(p)["canvas"]
    dirs = []
    rain_region = (cw // 2 - 128, chh // 2 - 64, 256, 128)
    cloud_region = (cw // 2 - 256, chh - 200, 512, 128)
    for w, reg, dt in [("heavyRain", rain_region, 1 / 60), ("storm", rain_region, 1 / 60), ("heavySnow", rain_region, 0.25), ("overcast", cloud_region, 2.0), ("partly", cloud_region, 2.0)]:
        for lv, d in [("normal", 1), ("strong", 1), ("strong", -1)]:
            dx, dy, c = motion(p, w, lv, d, reg, dt)
            dirs.append({"weather": w, "wind": lv, "dir": d, "dt": round(dt, 4), "dx": dx, "dy": dy, "peak": round(c, 3)})
    out["directions"] = dirs

    # ---------- 3. 水花方向 ----------
    spl = []
    for lv, d in [("normal", 1), ("strong", 1), ("strong", -1)]:
        prep(p, "storm", lv, d)
        p.evaluate("duckReview.advance(1.5)")
        s = st(p)
        vx = [q["vx"] for q in s["splashes"]]
        deep = [q for q in s["splashes"] if q["y"] - q["edge"] > 10]
        spl.append({"wind": lv, "dir": d, "n": len(vx), "meanVx": round(float(np.mean(vx)), 1) if vx else None, "deepInCard": len(deep)})
    out["splashes"] = spl

    # ---------- 4. 太阳位置（最亮点，晴天，正文/清屏两种） ----------
    sun = []
    for t in ["dawn", "noon", "dusk"]:
        for clean in [False, True]:
            p.evaluate(f"document.body.classList.toggle('clean', {str(clean).lower()})")
            p.wait_for_timeout(100)
            prep(p, "clear", "normal", 1, t)
            g = gray(p, 0, 0, cw, chh)[::4, ::4]
            iy, ix = np.unravel_index(np.argmax(g), g.shape)
            dpr = cw / 1440
            x, y = ix * 4 / dpr, iy * 4 / dpr
            cards = p.evaluate("[...document.querySelectorAll('.card, .panel, main > section')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})")
            under = any(l <= x <= r and tp <= y <= bt for l, tp, r, bt in cards)
            sun.append({"time": t, "clean": clean, "x": round(x), "y": round(y), "max": float(g.max()), "underCard": under, "elev": round(st(p)["sun"]["elev"], 1)})
    p.evaluate("document.body.classList.remove('clean')")
    out["sun"] = sun

    # ---------- 5. 导出命名（运行时下载） ----------
    prep(p, "heavyRain", "strong", -1)
    p.evaluate("duckReview.resume()")
    with p.expect_download() as dl:
        p.click("#export")
    exp = {"png": dl.value.suggested_filename, "exportBtn": p.inner_text("#export"), "recordBtn": p.inner_text("#record")}
    with p.expect_download(timeout=20000) as dl2:
        p.click("#record")
        p.wait_for_timeout(300)
        exp["exportingDuring"] = st(p)["exporting"]
    exp["video"] = dl2.value.suggested_filename
    p.wait_for_timeout(300)
    s = st(p)
    exp["after"] = {"recording": s["recording"], "exporting": s["exporting"]}
    # 录制中隐藏页面：应提前结束、保存已录部分并停帧循环
    with p.expect_download(timeout=20000) as dl3:
        p.click("#record")
        p.wait_for_timeout(1500)
        p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))")
    exp["hiddenStopSaved"] = dl3.value.suggested_filename
    s = st(p)
    exp["hidden"] = {"recording": s["recording"], "exporting": s["exporting"], "rafActive": s["rafActive"]}
    p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))")
    p.wait_for_timeout(3500)
    s = st(p)
    exp["visibleAgain"] = {"rafActive": s["rafActive"], "fps": s["fps"], "tickRate": s["tickRate"]}
    out["export"] = exp
    ctx.close()

    # ---------- 6. 降级路径 ----------
    def static_sig(p):
        return p.evaluate("""(() => { const c = document.getElementById('skyStatic'); if (!c || !c.width) return null;
          const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let m = 0, g = 0, n = 0;
          for (let y = 0; y < c.height; y += 3) for (let i = 0; i < c.width - 3; i += 3) { const k = (y * c.width + i) * 4;
            const v = d[k] + d[k+1] + d[k+2], v2 = d[k+12] + d[k+13] + d[k+14]; m += v; g += Math.abs(v - v2); n++; }
          return { mean: +(m / n / 3).toFixed(1), grad: +(g / n / 3).toFixed(2) }; })()""")

    fb = {}
    nogl = "HTMLCanvasElement.prototype.getContext = ((o) => function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); })(HTMLCanvasElement.prototype.getContext);"
    for dev in ["desk", "phone"]:
        for mode in ["nowebgl", "reduced"]:
            ctx = ctx_for(b, dev, reduced_motion="reduce" if mode == "reduced" else "no-preference")
            if mode == "nowebgl": ctx.add_init_script(nogl)
            p = ctx.new_page()
            p.on("pageerror", lambda e, t=f"{dev}-{mode}": out["errors"].append(f"{t} pageerror {e}"))
            p.goto(FILE_URL)
            p.wait_for_function("window.duckReview", timeout=15000); p.wait_for_timeout(500)
            rows = []
            for w in WEATHERS:
                for lv in ["normal", "strong"]:
                    p.evaluate(f"duckReview.setDate('2026-10-08'); duckReview.setTime('noon'); duckReview.setWeather('{w}'); duckReview.setWind('{lv}', 1)")
                    p.wait_for_timeout(60)
                    s = st(p)
                    sig = static_sig(p) if s["staticVisible"] else None
                    if mode == "reduced" and not s["staticVisible"]:
                        g = gray(p, 0, 0, 256, 256); sig = {"mean": round(float(g.mean()), 1), "grad": round(float(np.abs(np.diff(g, axis=1)).mean()), 2)}
                    rows.append({"weather": w, "wind": lv, "pill": s["pill"], "fallback": s["fallback"], "still": s["still"], "staticVisible": s["staticVisible"], "rafActive": s["rafActive"], "sig": sig})
            sigs = {json.dumps(r["sig"]) for r in rows}
            fb[f"{dev}-{mode}"] = {"rows": rows, "distinctSignatures": len(sigs), "of": len(rows)}
            ctx.close()

    # 上下文丢失/恢复、forceFallback
    ctx = ctx_for(b, "desk"); p = open_page(ctx, tag="ctxlost")
    p.evaluate("duckReview.setWeather('storm')")
    p.evaluate("window.__lc = document.getElementById('sky').getContext('webgl').getExtension('WEBGL_lose_context'); __lc.loseContext()")
    p.wait_for_timeout(500)
    s1 = st(p)
    p.evaluate("__lc.restoreContext()"); p.wait_for_timeout(1500)
    s2 = st(p)
    p.wait_for_timeout(2000); s3 = st(p)
    ff_on = p.evaluate("duckReview.forceFallback(true)"); s4 = st(p)
    ff_off = p.evaluate("duckReview.forceFallback(false)"); p.wait_for_timeout(2000); s5 = st(p)
    pick = lambda s: {k: s[k] for k in ["fallback", "staticVisible", "rafActive", "fps", "tickRate", "pill"]}
    fb["contextLost"] = {"lost": pick(s1), "restored": pick(s2), "restored+2s": pick(s3), "forceOn": [ff_on, pick(s4)], "forceOff": [ff_off, pick(s5)]}
    out["fallback"] = fb
    ctx.close()

    # ---------- 7. 往返缓存 ----------
    ctx = ctx_for(b, "desk"); p = open_page(ctx, f"http://127.0.0.1:{port}/index.html", tag="bfcache")
    p.evaluate("window.__marker = 1; window.__events = []; addEventListener('pagehide', e => sessionStorage.setItem('ph', e.persisted)); addEventListener('pageshow', e => __events.push(e.persisted))")
    p.goto(f"http://127.0.0.1:{port}/other.html"); p.wait_for_timeout(500)
    p.go_back(); p.wait_for_timeout(3000)
    restored = p.evaluate("window.__marker === 1")
    bf = {"restoredFromBfcache": restored, "pagehidePersisted": p.evaluate("sessionStorage.getItem('ph')")}
    if restored:
        s = st(p); bf.update({"pageshowPersisted": p.evaluate("__events"), "pageSuspended": s["pageSuspended"], "rafActive": s["rafActive"], "liveTimer": s["liveTimerActive"], "fps": s["fps"], "tickRate": s["tickRate"], "fallback": s["fallback"]})
    else:
        bf["reason"] = p.evaluate("JSON.stringify(performance.getEntriesByType('navigation')[0]?.notRestoredReasons ?? null)")
    out["bfcache"] = bf
    ctx.close()

    # ---------- 8. 实时帧率 ----------
    live = []
    for dev in ["desk", "phone"]:
        ctx = ctx_for(b, dev); p = open_page(ctx, tag="live-" + dev)
        for w, lv in [("clear", "normal"), ("partly", "strong"), ("storm", "strong"), ("heavySnow", "strong")]:
            p.evaluate(f"duckReview.setWeather('{w}'); duckReview.setWind('{lv}', 1)")
            p.wait_for_timeout(4000)
            s = st(p)
            ms = p.evaluate("duckReview.benchmark(30)")
            live.append({"dev": dev, "weather": w, "wind": lv, "fps": s["fps"], "tickRate": s["tickRate"], "quality": s["quality"], "canvas": s["canvas"], "gpuMsPerFrame": round(ms, 2)})
        ctx.close()
    out["live"] = live
    out["ua"] = b.version
    b.close()

json.dump(out, open(WORK + "/verify.json", "w"), ensure_ascii=False, indent=1)
print("errors:", out["errors"] or "无")
