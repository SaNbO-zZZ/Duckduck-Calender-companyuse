"""补充复核：雨丝倾向（结构张量）、云速比、水花越界、往返缓存事件模拟、隐藏恢复后无集中喷发"""
import json
import numpy as np
from playwright.sync_api import sync_playwright

URL = "file:///Users/xz/Desktop/鸭鸭日历.html"
out = {"errors": []}


def gray(p, x, y, w, h):
    return np.array(p.evaluate(f"duckReview.readGray({x},{y},{w},{h})"), dtype=np.float32).reshape(h, w)[::-1]


def prep(p, w, lv, d):
    p.evaluate(f"duckReview.pause(); duckReview.setDate('2026-10-08'); duckReview.setTime('noon'); duckReview.setWeather('{w}'); duckReview.setWind('{lv}', {d}); duckReview.resetMotion(); duckReview.advance(0.5)")


def tilt(g):
    """主条纹方向：返回条纹相对竖直的偏角（度），正值 = 上端偏左、下端偏右（即向右下落）"""
    gx = np.gradient(g, axis=1); gy = np.gradient(g, axis=0)
    jxx, jyy, jxy = (gx * gx).sum(), (gy * gy).sum(), (gx * gy).sum()
    # 梯度主方向的法向即条纹方向
    theta = 0.5 * np.arctan2(2 * jxy, jxx - jyy)  # 梯度主方向（相对 x 轴）
    return float(np.degrees(-theta)), float((np.hypot(jxx - jyy, 2 * jxy)) / (jxx + jyy + 1e-9))


def track(p, region, dt, n):
    """多帧累积相位相关（每步小位移），返回总 dx, dy（设备像素，图像坐标）"""
    x, y, w, h = region
    tot = np.zeros(2); a = gray(p, x, y, w, h); peaks = []
    win = np.outer(np.hanning(h), np.hanning(w))
    for _ in range(n):
        p.evaluate(f"duckReview.advance({dt})")
        b = gray(p, x, y, w, h)
        F = np.fft.fft2((a - a.mean()) * win); G = np.fft.fft2((b - b.mean()) * win)
        R = G * np.conj(F); R /= np.abs(R) + 1e-9
        r = np.fft.ifft2(R).real
        dy, dx = np.unravel_index(np.argmax(r), r.shape)
        if dy > h // 2: dy -= h
        if dx > w // 2: dx -= w
        tot += (dx, dy); peaks.append(r.max()); a = b
    return tot.tolist(), float(np.median(peaks))


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    p = ctx.new_page()
    p.on("pageerror", lambda e: out["errors"].append(str(e)))
    p.goto(URL); p.wait_for_function("window.duckReview && duckReview.state().canvas[0] > 0"); p.wait_for_timeout(400)
    cw, ch = p.evaluate("duckReview.state().canvas")

    rain = []
    for w in ["lightRain", "heavyRain", "storm"]:
        for lv, d in [("normal", 1), ("strong", 1), ("strong", -1)]:
            prep(p, w, lv, d)
            ang, coh = tilt(gray(p, cw // 2 - 200, ch // 2 - 150, 400, 300))
            # 下落：极小步长（1/240 s）逐帧相位相关
            mv, pk = track(p, (cw // 2 - 128, ch // 2 - 128, 256, 256), 1 / 240, 4)
            rain.append({"weather": w, "wind": lv, "dir": d, "tiltDeg": round(ang, 1), "coherence": round(coh, 2), "move4x(1/240s)": mv, "peak": round(pk, 3)})
    out["rainTilt"] = rain

    clouds = []
    for w in ["partly", "overcast"]:
        for lv, d in [("normal", 1), ("strong", 1), ("strong", -1)]:
            prep(p, w, lv, d)
            mv, pk = track(p, (cw // 2 - 256, ch // 2 + 50, 512, 256), 0.1, 10)
            clouds.append({"weather": w, "wind": lv, "dir": d, "dx_per_s": round(mv[0], 1), "dy_per_s": round(mv[1], 1), "peak": round(pk, 3)})
    out["clouds"] = clouds

    sp = []
    for lv, d in [("normal", 1), ("strong", 1), ("strong", -1)]:
        prep(p, "storm", lv, d)
        for k in range(6):
            p.evaluate("duckReview.advance(0.5)")
            s = p.evaluate("duckReview.state().splashes")
            for q in s:
                cx, cy, cwid = q["card"]
                inside = cx <= q["x"] <= cx + cwid
                if inside and q["y"] - q["edge"] > 10:
                    sp.append({"wind": lv, "dir": d, **q})
    out["splashDeepInsideCard"] = sp[:10]
    out["splashDeepInsideCardCount"] = len(sp)

    # 往返缓存：合成 PageTransitionEvent（无头 Chrome 未进入真实 bfcache）
    p.evaluate("duckReview.resume(); duckReview.setWeather('storm')"); p.wait_for_timeout(2000)
    bf = {}
    p.evaluate("dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}))"); p.wait_for_timeout(300)
    bf["hidePersisted"] = p.evaluate("(({rafActive, liveTimerActive, pageSuspended}) => ({rafActive, liveTimerActive, pageSuspended}))(duckReview.state())")
    p.evaluate("dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}))"); p.wait_for_timeout(3500)
    bf["showPersisted"] = p.evaluate("(({rafActive, liveTimerActive, pageSuspended, fps, tickRate, fallback}) => ({rafActive, liveTimerActive, pageSuspended, fps, tickRate, fallback}))(duckReview.state())")
    p.evaluate("dispatchEvent(new PageTransitionEvent('pagehide', {persisted: false}))"); p.wait_for_timeout(300)
    bf["hideTorn"] = p.evaluate("(({rafActive, liveTimerActive, pageSuspended}) => ({rafActive, liveTimerActive, pageSuspended}))(duckReview.state())")
    p.evaluate("dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}))"); p.wait_for_timeout(3500)
    bf["showAfterTorn"] = p.evaluate("(({rafActive, liveTimerActive, pageSuspended, fps, tickRate, fallback}) => ({rafActive, liveTimerActive, pageSuspended, fps, tickRate, fallback}))(duckReview.state())")
    bf["drawsAfterTorn"] = float(np.std(gray(p, 0, 0, 200, 200))) > 0
    out["bfcacheSynthetic"] = bf

    # 隐藏 5 秒后恢复：首帧 dt、水花数量是否突增
    p.wait_for_timeout(1500)
    before = p.evaluate("duckReview.state().splashes.length")
    p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))")
    c0 = p.evaluate("duckReview.state().clock"); p.wait_for_timeout(5000); c1 = p.evaluate("duckReview.state().clock")
    p.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))")
    seq = []
    for _ in range(10):
        p.wait_for_timeout(50); seq.append(p.evaluate("[duckReview.state().clock, duckReview.state().splashes.length]"))
    p.wait_for_timeout(3000)
    out["hiddenResume"] = {"splashesBefore": before, "clockAdvancedWhileHidden": round(c1 - c0, 3), "after(clock,splashes)": [[round(a, 3), n] for a, n in seq], "tickRate": p.evaluate("duckReview.state().tickRate")}
    b.close()

json.dump(out, open("/tmp/duck3/verify2.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
