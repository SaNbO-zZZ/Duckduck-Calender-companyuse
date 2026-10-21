from pathlib import Path
p=Path('/Users/xz/Desktop/鸭鸭日历.html')
s=p.read_text()
def replace(a,b):
 global s
 assert a in s, a[:100]
 s=s.replace(a,b,1)
replace('x - 3 - X.wind * 4','x - 3 + X.wind * 4')
replace('const duckDomMode = () => duckForceDom || !dctx;', '''const duckDomMode = () => duckForceDom || duckContextLost || !dctx || !!(dctx.isContextLost && dctx.isContextLost());
      let duckContextLost = false;
      duckCanvas.addEventListener("contextlost", (e) => {
        e.preventDefault();
        duckContextLost = true;
        duckRefresh();
      });
      duckCanvas.addEventListener("contextrestored", () => {
        try { dctx = duckCanvas.getContext("2d"); } catch (_) { dctx = null; }
        duckContextLost = false;
        duckSprites.clear();
        duckRefresh();
      });''')
replace('/ 60, -1, 1) * 4) / 4,','/ 90, -1, 1) * 4) / 4,')
replace('''        const fam = DUCK_FAMILY[WEATHERS[weatherIndex].key];''','''        const paintStarted = performance.now();
        const fam = DUCK_FAMILY[WEATHERS[weatherIndex].key];''')
replace('''        const t0 = performance.now();
        if (dom) duckPaintDom(list);
        else duckPaint(list);
        duckDrawMs = performance.now() - t0;''','''        if (dom) duckPaintDom(list);
        else duckPaint(list);
        duckDrawMs = performance.now() - paintStarted;''')
replace('''        duckCanvas.style.display = "block";
        duckDomBox.style.display = "none";
        if (!dctx || (dctx.isContextLost && dctx.isContextLost())) return;''','''        if (duckDomMode() || list.some((it) => !it.spr.cv)) {
          duckContextLost = true;
          duckLastSig = "";
          updateDucks(0, false);
          return;
        }
        duckCanvas.style.display = "block";
        duckDomBox.style.display = "none";''')
# Sprite creation failure immediately falls back to PNG, then whole scene switches to DOM.
old='''          s.cv.getContext("2d").putImageData(new ImageData(rgba, W, H), 0, 0);'''
new='''          try {
            const ctx = s.cv.getContext("2d");
            if (!ctx || (ctx.isContextLost && ctx.isContextLost())) throw Error("2D unavailable");
            ctx.putImageData(new ImageData(rgba, W, H), 0, 0);
          } catch (_) {
            s.cv = null;
            s.url = duckPng(rgba, W, H);
            duckContextLost = true;
          }'''
assert s.count(old)==2
s=s.replace(old,new)
replace('''          for (let k = Math.max(1, Math.round(dpr * (mode === "single" ? 1 : 0.62))); k >= 1 && !res; k--) {
            const cell = k / dpr,''','''          // CSS 尺寸按可用宽度确定；DPR 仅决定画布分辨率。低 DPR 也允许亚像素尺寸，保持 nearest-neighbor。
          const idealCell = mode === "single" ? 1 : 0.72;
          for (let units = Math.round(idealCell * 64); units >= 1 && !res; units--) {
            const cell = units / 64, k = cell * dpr,''')
a=s.index('''        if (!res) {
          // 极窄视口兜底''')
b=s.index('''        const { k, cell } = res,''',a)
s=s[:a]+'''        // 即使极窄窗口也按两排真实占宽缩放，绝不使用重叠挤压。
        if (!res) {
          const groups = [duckSlots.filter((s) => s.row2 === 0), duckSlots.filter((s) => s.row2 === 1)];
          const required = Math.max(...groups.map((row) => row.reduce((n, v) => n + 2 * halves[v.i], 0) + (row.length - 1) * DUCK_GAP));
          const cell = flatW / (required + 2);
          res = { mode: "two", k: cell * dpr, cell, rows: groups.map((row) => duckPlaceRow(row, "x2", halves, flatW / cell)) };
        }
''' + s[b:]
replace('// 每个美术格 = 整数 k 个设备像素，关闭平滑，坐标对齐设备像素。','// CSS 美术格按可用宽度缩放，DPR 只决定采样分辨率；关闭平滑，锚点对齐设备像素。')
replace('''        ><button class="cta" title="审查样例，不提交真实记录">
          臣妾做不到啊😭
        </button>''','''        >
        <div class="attendance-actions" aria-label="出勤登记">
          <button type="button" class="action-secondary" id="lateAction">天才总是晚到</button>
          <button type="button" class="action-secondary" id="earlyAction">我先去拯救世界了</button>
          <button type="button" class="cta" id="leaveAction">臣妾做不到啊😭</button>
        </div>''')
replace('<p class="greeting" id="greeting">早上好 · 2026 年 10 月 8 日 周四</p>', '<p class="greeting" id="greeting">正在读取北京时间…</p>')
replace('<h2>2026 年 10 月</h2>\n          <small>‹　今天　›</small>', '<h2 id="calendarMonth"></h2>\n          <small id="calendarCaption">北京时间</small>')
replace('''  <canvas id="ducks" aria-hidden="true"></canvas>''','''  <dialog id="attendanceDialog" aria-labelledby="attendanceTitle">
    <div class="dialog-heading"><div><p class="dialog-eyebrow" id="attendanceEyebrow"></p><h2 id="attendanceTitle"></h2></div><button type="button" class="dialog-close" id="attendanceClose" aria-label="关闭">×</button></div>
    <form id="attendanceForm">
      <div id="attendanceFields"></div>
      <label class="form-field">@你的 Mentor <span class="required">*</span><input id="mentorInput" name="mentor" type="text" placeholder="输入你的 Mentor 姓名" maxlength="80" required autocomplete="off" /></label>
      <label class="form-field">人事<input id="hrInput" value="Mia" readonly aria-readonly="true" /><small>固定通知 Mia · 仅通知，无审批</small></label>
      <p class="local-form-note">本地审查：Mentor 暂用姓名输入，正式通讯录选择与消息发送待接入。</p>
      <div id="attendanceResult" role="status" aria-live="polite" hidden></div>
      <div class="dialog-footer"><button type="button" id="attendanceCancel" class="form-cancel">取消</button><button type="submit" class="cta">预览通知</button></div>
    </form>
  </dialog>
  <canvas id="ducks" aria-hidden="true"></canvas>''')
css='''
    .attendance-actions { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-left:auto; }
    .attendance-actions .cta { margin:0; }
    .action-secondary { border:1px solid #ffffff; border-radius:40px; background:#ffffffc4; color:#394650; padding:13px 20px; font-weight:600; box-shadow:0 4px 18px #24466508; }
    .action-secondary:hover { background:#fff; }
    button:focus-visible, input:focus-visible { outline:3px solid #6b80da; outline-offset:3px; }
    #attendanceDialog { box-sizing:border-box; width:min(480px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); border:1px solid #fff; border-radius:28px; background:#fffdfa; color:#302f2d; padding:28px; box-shadow:0 24px 90px #1827353b; overflow-y:auto; }
    #attendanceDialog::backdrop { background:#23303e55; backdrop-filter:blur(8px); }
    .dialog-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:26px; }
    .dialog-heading h2 { margin:0; font-size:24px; letter-spacing:-.4px; }
    .dialog-eyebrow { margin:0 0 7px; color:#95887c; font-size:12px; }
    .dialog-close { width:34px; height:34px; flex-shrink:0; border:0; border-radius:50%; background:#f1f0ed; color:#575653; font-size:24px; line-height:1; }
    .form-field { display:block; margin:0 0 22px; font-size:14px; font-weight:600; }
    .required { color:#ff695d; }
    .form-field input { display:block; box-sizing:border-box; width:100%; min-width:0; margin-top:9px; border:1px solid transparent; border-radius:16px; padding:13px 15px; color:#363531; background:#f5f3ef; font:400 15px inherit; font-family:inherit; font-size:15px; font-weight:400; color-scheme:light; }
    .form-field input[readonly] { color:#756b62; background:#f2f0eb; }
    .form-field small { display:block; margin-top:8px; font-size:12px; font-weight:400; color:#978b80; }
    .date-pair { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(100px,1fr); gap:8px; }
    .leave-types { display:flex; flex-wrap:wrap; gap:8px; margin-top:9px; }
    .leave-type { display:inline-flex; align-items:center; position:relative; cursor:pointer; }
    .leave-type input { position:absolute; width:1px; height:1px; opacity:0; margin:0; padding:0; }
    .leave-type span { border-radius:30px; background:#f5f3ef; padding:10px 13px; font-size:13px; font-weight:500; }
    .leave-type input:checked + span { color:#fff; background:#ff805a; }
    .leave-type input:focus-visible + span { outline:3px solid #6b80da; outline-offset:2px; }
    .local-form-note { font-size:12px; line-height:1.7; color:#958b80; margin:0 0 20px; }
    .dialog-footer { display:flex; align-items:center; justify-content:flex-end; gap:12px; }
    .dialog-footer .cta { margin:0; padding:13px 24px; }
    .form-cancel { border:0; background:transparent; color:#83796f; padding:13px; }
    #attendanceResult { white-space:pre-line; font-size:13px; line-height:1.8; background:#f0f4ef; border:1px solid #dfe7dc; border-radius:16px; padding:14px; margin:0 0 20px; }
    .form-error { color:#b64336; }
    @media (max-width:720px) {
      .attendance-actions { display:grid; grid-template-columns:1fr; gap:9px; width:100%; margin:6px 0 0; }
      .attendance-actions button { width:100%; margin:0; padding:13px 12px; font-size:14px; }
      #attendanceDialog { padding:22px; border-radius:24px; }
      .dialog-heading h2 { font-size:22px; }
    }
    @media (prefers-reduced-motion:reduce) { #attendanceDialog::backdrop { backdrop-filter:none; } }
'''
replace('''  </style>''',css+'  </style>')
replace('''          greetingFor(minutes) + " · " + date.y + " 年 " + date.m + " 月 " + date.d + " 日 周" + week;''','''          (demoDate ? "演示 · " : "") + greetingFor(minutes) + " · " + date.y + " 年 " + date.m + " 月 " + date.d + " 日 周" + week;
        renderCalendar(date, now);
        updateAttendanceClock();''')
replace('''          if (timeMode === "live" && !hidden) updateTimeState(false);''','''          if (!hidden) updateTimeState(false);''')
replace('''        if (e.key === "Escape") {''','''        if (e.key === "Escape" && !$("attendanceDialog").open) {''')
a=s.index('''      // ================= 11. 本地演示日历''');b=s.index('''      // ================= 12.''',a)
s=s[:a]+'''      // ================= 11. 日历与本地表单预览（北京时间；不连接或发送真实业务数据） =================
      let calendarKey = "", attendanceKind = "leave", attendanceTrigger = null;
      const HR = Object.freeze({ name: "Mia", email: "mia@alphapulsex.online" });
      const isoDay = (d) => `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      function renderCalendar(date, now) {
        const key = `${date.y}-${date.m}|${isoDay(now)}|${!!demoDate}`;
        if (key === calendarKey) return;
        calendarKey = key;
        const cal = $("calendar");
        cal.replaceChildren();
        $("calendarMonth").textContent = `${date.y} 年 ${date.m} 月`;
        $("calendarCaption").textContent = demoDate ? "演示月份 · 今天按北京时间标记" : "北京时间 · 今天";
        for (const w of ["一", "二", "三", "四", "五", "六", "日"]) {
          const el = document.createElement("div"); el.className = "weekday"; el.textContent = w; cal.append(el);
        }
        const first = new Date(Date.UTC(date.y, date.m - 1, 1)), offset = (first.getUTCDay() + 6) % 7;
        const days = new Date(Date.UTC(date.y, date.m, 0)).getUTCDate(), count = Math.ceil((offset + days) / 7) * 7;
        for (let i = 0; i < count; i++) {
          const day = new Date(Date.UTC(date.y, date.m - 1, 1 - offset + i));
          const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
          const el = document.createElement("div"); el.className = "date"; el.textContent = d;
          if (m !== date.m) el.classList.add("muted");
          // 沿用已核对的 2026 国庆数据；未录入的月份不推测法定节假日。
          const mark = y === 2026 && m === 10 ? (d <= 7 ? "休" : d === 10 ? "班" : "") : "";
          if (mark) { el.classList.add(mark === "休" ? "holiday" : "work"); const badge = document.createElement("span"); badge.className = "mark"; badge.textContent = mark; el.append(badge); }
          if (y === now.y && m === now.m && d === now.d) { el.classList.add("today"); el.setAttribute("aria-current", "date"); }
          cal.append(el);
        }
      }
      function updateAttendanceClock() {
        const field = $("attendanceNow");
        if (!field) return;
        const now = shanghaiNow();
        field.value = `${isoDay(now)} ${hhmm(now.minutes)}（北京时间）`;
        const eta = $("arrivalTime");
        if (eta) eta.min = hhmm(Math.min(1439, Math.max(601, now.minutes + 1)));
      }
      function attendanceField(label, id, type, value, attributes = "") {
        return `<label class="form-field">${label} <span class="required">*</span><input id="${id}" name="${id}" type="${type}" value="${value}" ${attributes} required /></label>`;
      }
      function openAttendance(kind, trigger) {
        const now = shanghaiNow(), today = isoDay(now);
        attendanceKind = kind; attendanceTrigger = trigger;
        $("attendanceForm").reset();
        $("attendanceResult").hidden = true;
        $("attendanceResult").textContent = "";
        $("mentorInput").value = "";
        $("hrInput").value = HR.name;
        $("attendanceTitle").textContent = { leave: "申请请假", late: "天才总是晚到", early: "我先去拯救世界了" }[kind];
        $("attendanceEyebrow").textContent = kind === "leave" ? "给自己一点休息时间" : kind === "late" ? "今天 10 点以后到达公司" : "今天提前下班";
        let content = "";
        if (kind === "leave") {
          const types = [["年假","🌴"],["调休","↔️"],["事假","📝"],["病假","🤒"],["今天不想上班","📌"]];
          content = `<fieldset class="form-field" style="border:0;padding:0"><legend>类型 <span class="required">*</span></legend><div class="leave-types">${types.map(([name,icon],i) => `<label class="leave-type"><input type="radio" name="leaveType" value="${name}" ${i===0?"checked":""} required /><span>${icon} ${name}</span></label>`).join("")}</div></fieldset>`;
          for (const [title, prefix, time] of [["开始时间","leaveStart","09:00"],["结束时间","leaveEnd","18:00"]])
            content += `<div class="form-field">${title} <span class="required">*</span><div class="date-pair"><input type="date" id="${prefix}Date" name="${prefix}Date" aria-label="${title}日期" value="${today}" required /><input type="time" id="${prefix}Time" name="${prefix}Time" aria-label="${title}时刻" value="${time}" required /></div></div>`;
        } else {
          content = `<label class="form-field">当前时间<input id="attendanceNow" readonly /><small>${today} · 北京时间，跟随当前时间更新</small></label>`;
          if (kind === "late") content += attendanceField("预计到达时间", "arrivalTime", "time", now.minutes < 1439 ? hhmm(Math.min(1439, Math.max(601, now.minutes + 30))) : "", 'aria-label="预计到达时间"') + `<p class="local-form-note">预计今天到达，须晚于 10:00 和当前时间。</p>`;
        }
        $("attendanceFields").innerHTML = content;
        updateAttendanceClock();
        $("attendanceDialog").showModal();
      }
      $("leaveAction").onclick = (e) => openAttendance("leave", e.currentTarget);
      $("lateAction").onclick = (e) => openAttendance("late", e.currentTarget);
      $("earlyAction").onclick = (e) => openAttendance("early", e.currentTarget);
      const closeAttendance = () => $("attendanceDialog").close();
      $("attendanceClose").onclick = closeAttendance;
      $("attendanceCancel").onclick = closeAttendance;
      $("attendanceDialog").addEventListener("close", () => attendanceTrigger?.focus());
      $("attendanceForm").onsubmit = (e) => {
        e.preventDefault();
        const result = $("attendanceResult"), values = new FormData(e.currentTarget), now = shanghaiNow();
        const mentor = String(values.get("mentor") || "").trim();
        let error = mentor ? "" : "请填写你的 Mentor 姓名。", detail = "";
        if (attendanceKind === "leave") {
          const start = `${values.get("leaveStartDate")}T${values.get("leaveStartTime")}`, end = `${values.get("leaveEndDate")}T${values.get("leaveEndTime")}`;
          if (end <= start) error = "结束时间须晚于开始时间。";
          detail = `${values.get("leaveType")} · ${start.replace("T"," ")} 至 ${end.replace("T"," ")}`;
        } else if (attendanceKind === "late") {
          const time = String(values.get("arrivalTime")), [h,m] = time.split(":").map(Number), minutes = h*60+m;
          if (!Number.isFinite(minutes) || minutes <= 600 || minutes <= now.minutes) error = "预计到达时间须晚于今天 10:00 和当前时间。";
          detail = `${isoDay(now)} · 当前 ${hhmm(now.minutes)}，预计 ${time} 到达`;
        } else detail = `${isoDay(now)} · ${hhmm(now.minutes)} 提前下班`;
        result.hidden = false; result.classList.toggle("form-error", !!error);
        result.textContent = error || `通知预览 · ${$("attendanceTitle").textContent}\\n${detail}\\n@${mentor} · @${HR.name}\\n仅通知，无审批。本地预览尚未发送。`;
      };

''' + s[b:]
# Extend the same-file narrow preview with selectable widths. No second application copy.
replace('''      label.textContent = "手机宽度审查 · 390 × 844 · 桌面浏览器模拟（非真机）";''','''      const requestedWidth = Number(new URLSearchParams(location.search).get("width"));
      const previewWidth = [320, 360, 390].includes(requestedWidth) ? requestedWidth : 390;
      label.textContent = `手机宽度审查 · ${previewWidth} × 844 · 桌面浏览器模拟（非真机）`;''')
replace('''      frame.style.cssText =
        "width:390px;height:844px;border:1px solid #7c8798;border-radius:24px;background:#dce5ec;box-shadow:0 20px 60px #0005";''','''      frame.style.cssText =
        `width:${previewWidth}px;max-width:100%;height:844px;border:1px solid #7c8798;border-radius:24px;background:#dce5ec;box-shadow:0 20px 60px #0005`;''')
# Organic coherent density field instead of regularly spaced sphere/pill shapes.
a=s.index('''    // 英雄云的一个球状子团''');b=s.index('''    // billow：''',a)
s=s[:a]+'''    // 连续的云体密度：三层湍流随同一坐标平移，避免分离的球体与规则鼓包。
    float cloudMass(vec2 p) {
      return 0.60 * noise(p * 1.25) + 0.26 * noise(p * 2.57 + vec2(3.7, 1.9)) + 0.14 * noise(p * 5.31 + vec2(1.8, 9.3));
    }
    // 遮阳云为不对称的连贯体积；边缘和内层密度随云移动，不用逐个球面的法线。
    float heroBlob(vec2 l, out vec4 sh, out float qc) {
      vec2 warp = (vec2(noise(l * 29.0 + 3.1), noise(l * 33.0 + vec2(7.7,1.3))) - 0.5) * 0.022;
      vec2 q = l + warp;
      vec2 a = (q - vec2(-0.025,-0.026)) / vec2(0.123,0.040);
      vec2 b = (q - vec2(0.080,-0.036)) / vec2(0.080,0.032);
      vec2 c = (q - vec2(-0.100,-0.034)) / vec2(0.065,0.029);
      float mass = 0.86*exp(-dot(a,a)*1.35) + 0.62*exp(-dot(b,b)*1.5) + 0.48*exp(-dot(c,c)*1.4);
      float detail = cloudMass(q * vec2(24.0,38.0)) - 0.5;
      mass += detail * 0.24 * smoothstep(0.05,0.35,mass);
      qc = clamp(mass,0.0,1.0);
      sh = vec4(clamp(a * 0.32,-1.0,1.0), qc, max(mass-0.2,0.0)*0.085);
      return max(0.0, 0.38 + (mass - 0.34) * 1.3);
    }

''' + s[b:]
a=s.index('''      // 主体 = 大 puff 云体''');b=s.index('''      vec2 hp =''',a)
s=s[:a]+'''      // 连贯的湍流密度场，细节侵蚀轮廓；云量仅由天气决定。
      float tN = mix(0.82, 0.32, uCloudCover) - 0.04 * precip;
      float nearF = cloudMass(bn) + 0.025 * (noise(bn * 10.7) - 0.5);
''' + s[b:]
a=s.index('''      float d1D =''');b=s.index('''      float own =''',a)
s=s[:a]+'''      float d1 = cloudMass(b1);
      float d2 = cloudMass(b2);
''' + s[b:]
replace('''      lightN -= clamp(d1D - nearD, -0.25, 0.25) * 2.0 * contrast * smoothstep(0.0, 0.05, own);''','''      lightN -= clamp(d1 - nearF, -0.15, 0.15) * 1.2 * contrast * smoothstep(0.0, 0.08, own);''')
a=s.index('''        // 英雄云：按最前子团''');b=s.index('''      if (hb > 0.01) {''',a)
s=s[:a]+'''        // 大尺度厚度控制暗部，迎光方向的连续细节控制亮部，避免逐球发亮的泡沫质感。
        vec2 sd = uSunPos * vec2(uAspect,1.0) - hp;
        float sdist = length(sd);
        vec2 lightDir = normalize(sd + vec2(0.0,0.08));
        float density = cloudMass(local * vec2(24.0,38.0));
        float toward = cloudMass((local + lightDir * 0.006) * vec2(24.0,38.0));
        float transmit = exp(-hs.w * 15.0);
        float hl = 0.62 + 0.32 * transmit + clamp(density-toward,-0.12,0.12) * 0.7;
        hl *= mix(0.85,1.0,smoothstep(-0.08,0.012,local.y));
        float hcore = mix(0.86,0.62,smoothstep(0.0,0.9,hqc));
        hl = mix(hl,hcore,1.0-smoothstep(0.02,0.045,sdist));
        lightN = mix(lightN,1.0-contrast*(1.0-hl),hw);
      }
''' + s[b:]
p.write_text(s)
print('Updated same HTML:',len(s.encode()),'bytes',len(s.splitlines()),'lines')
