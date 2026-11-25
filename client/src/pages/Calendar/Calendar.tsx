import { displayText } from '../../lib/display-text';
import { dayInfo, skyAt } from '../../../../shared/hefei-sky';
import { dailyQuote } from '../../../../shared/daily-quotes';
import { classifyPresence } from '../../../../shared/calendar-presence';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudSun,
  Palette,
  Plane,
  Sunrise,
  UsersRound,
} from 'lucide-react';
import {
  addBeijingDays,
  beijingDate,
  parseBeijingDate,
  weekdayOf,
} from '../../../../shared/duty-calendar';
import type {
  CalendarData,
  CalendarConfig,
  WeatherData,
  RegistrationKind,
} from '../../../../shared/api.interface';
import { festivals, inFestival } from '../../../../shared/festivals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { burst, useResource, useUser } from '../../lib/client';
import { DutyDuckStage } from './DutyDuckStage';
import { RegisterForm, title } from './RegisterForm';
import { ThemeRow, FestivalPanel, Preview } from './FestivalPanel';
import { Sky } from './scene/Sky';
import { Particles } from './scene/Particles';
import { WeatherDucks } from './scene/WeatherDucks';
const weekdays = '一二三四五六日';
const kinds = [
  { id: 'late', label: '英雄总是最后才到', Icon: Clock3 },
  { id: 'early', label: '我先去拯救世界了', Icon: Sunrise },
  { id: 'leave', label: '请假 / 出差', Icon: Plane },
] as const;
function changeMonth(value: string, delta: number) {
  const d = new Date(value + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
export default function Calendar() {
  const user = useUser(),
    [now, setNow] = useState(Date.now),
    today = beijingDate(now);
  const [month, setMonth] = useState(today.slice(0, 7)),
    [date, setDate] = useState(today),
    [direction, setDirection] = useState(1);
  const [rev, refresh] = useState(0),
    [weatherRev, refreshWeather] = useState(0),
    [kind, setKind] = useState<RegistrationKind | null>(null),
    [busy, setBusy] = useState(false);
  const registrationDone = useCallback(() => {
    burst();
    refresh((i) => i + 1);
  }, []);
  const [panel, setPanel] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    reduce = useReducedMotion();
  const cal = useResource<CalendarData>('/api/calendar/month?month=' + month, rev),
    cfg = useResource<CalendarConfig>('/api/calendar/config', rev),
    weather = useResource<WeatherData>('/api/calendar/weather', weatherRev).data,
    settings = useResource<ThemeRow[]>('/api/festivals', rev);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 15000),
      r = setInterval(() => {
        if (!document.hidden) refresh((i) => i + 1);
      }, 120000),
      w = setInterval(() => refreshWeather((i) => i + 1), 300000);
    return () => {
      clearInterval(clock);
      clearInterval(r);
      clearInterval(w);
    };
  }, []);
  const hour = new Date(now + 28800000).getUTCHours();
  const sky = useMemo(() => {
    if (!preview) return skyAt(now);
    const { midnight, noon } = dayInfo(now);
    return skyAt(midnight + (preview.night ? 22 * 60 : noon) * 60000);
  }, [now, preview]);
  const phase = sky.phase, night = phase === 'night';
  const theme = festivals.find((f) =>
    preview
      ? f.key === preview.key
      : settings.data?.some((r) => r.key === f.key && r.enabled) && inFestival(f.key, today),
  );
  const presence = classifyPresence(cal.data?.todayEvents || [], now),
    active = presence.people,
    { onWay, early, away } = presence.counts;
  const trips = active.filter((p) => p.event.type === '出差').length;
  const summary = [
    onWay && `此刻有 ${onWay} 位英雄正在赶来的路上`,
    early && `${early} 位同事先去拯救世界了`,
    trips && `${trips} 位同事正在出差途中`,
    away > trips && `${away - trips} 位同事正在休整充电中`,
  ].filter(Boolean).join('，');
  useEffect(() => {
    if (Number.isFinite(presence.nextTransition)) {
      const t = setTimeout(
        () => setNow(Date.now()),
        Math.max(1, presence.nextTransition - Date.now() + 1),
      );
      return () => clearTimeout(t);
    }
  }, [presence.nextTransition]);
  const monthStart = month + '-01',
    first = addBeijingDays(monthStart, 1 - weekdayOf(monthStart)),
    days = Array.from({ length: 42 }, (_, i) => addBeijingDays(first, i));
  const person = (id: string) => displayText(cal.data?.people.find((p) => p.id === id)?.name || '') || '账号资料待同步';
  const onDay = (d: string) =>
    cal.data?.events.filter(
      (e) => e.start < parseBeijingDate(d) + 86400000 && e.end > parseBeijingDate(d),
    ) || [];
  const chosen = onDay(date);
  function select(d: string) {
    setDate(d);
    if (!d.startsWith(month)) {
      setDirection(d < monthStart ? -1 : 1);
      setMonth(d.slice(0, 7));
    }
  }
  function move(n: number) {
    const m = changeMonth(month, n);
    setDirection(n);
    setMonth(m);
    setDate(m === today.slice(0, 7) ? today : m + '-01');
  }
  const stagger = {
    hidden: { opacity: 1, y: reduce ? 0 : 8 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 26 } },
  };
  return (
    <div
      className={'calendar-app ' + (night ? 'is-night' : '')}
      data-festival={theme?.key || 'regular'}
      style={{
        '--accent': theme?.color || '#407c67',
        '--wash': theme?.light || '#e1eedc',
        '--night': theme?.night || '#263b49',
      }}
    >
      <Sky sky={sky} theme={theme?.key} weather={weather} night={night} />
      <Particles
        theme={theme?.key}
        night={night}
        ambient dusk={phase === 'dusk'}
        wind={(weather?.windSpeed ?? 0) * (weather?.windDir ?? 1)}
        rain={weather?.precipType === 'rain' ? weather.precipLevel : 0}
        snow={weather?.precipType === 'snow' ? weather.precipLevel : 0}
      />
      <motion.main
        className="planner"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.06 } } }}
      >
        <motion.header variants={stagger} className="topbar">
          <Link className="brand" to="/">
            <img src="/assets/duty-ducks-v2/caishen/idle-00.png" alt="" />
            <strong>鸭鸭日历</strong>
          </Link>
          <span className="weather-pill" title={weather?.available ? undefined : '天气更新时，天空暂以暖晴呈现'}>
            <CloudSun size={17} />
            合肥 · {weather?.temperature != null && `${Math.round(weather.temperature)}°C `}{weather?.description || '暖晴'}
            {weather?.windLevel >= 2 && (weather.windLevel === 3 ? ' · 强风' : ' · 大风')}
          </span>
          <nav>
            <Link to="/charter">
              <BookOpen size={17} />
              鸭鸭公约
            </Link>
            {user.role === 'admin' && (
              <button aria-label="节日预览" onClick={() => setPanel(true)}>
                <Palette size={17} />
                <span>节日预览</span>
              </button>
            )}
            <span className="avatar" title={user.name}>
              {user.avatar_url ? <img alt={user.name} src={user.avatar_url} /> : user.name?.slice(0, 1)}
            </span>
          </nav>
        </motion.header>
        {preview && (
          <aside className="preview-strip">
            {theme?.name} · {night ? '夜晚' : '白天'}预览
            <button onClick={() => setPanel(true)}>切换</button>
            <button onClick={() => setPreview(null)}>结束预览</button>
          </aside>
        )}
        <motion.section variants={stagger} className="hero">
          <WeatherDucks weather={weather} phase={phase} halloween={theme?.key === 'halloween'} />
          <div className="hero-copy">
            <div className="hero-date">
              <span className="dot" />
              {today.slice(0, 4)} 年 {Number(today.slice(5, 7))} 月 {Number(today.slice(8))} 日 星期
              {weekdays[weekdayOf(today) - 1]}
              {theme && <b>{theme.name}</b>}
            </div>
            <h1>
              {hour < 6
                ? '夜深了'
                : hour < 11
                  ? '早上好'
                  : hour < 14
                    ? '中午好'
                    : hour < 18
                      ? '下午好'
                      : '晚上好'}
              ，{user.name || '同事'}
              <span>。</span>
            </h1>
            <p>
              {cal.data ? (
                summary || '全员在岗，一切安好～'
              ) : (
                cal.error || '正在读取团队知会…'
              )}
            </p>
            <div className="hero-actions">
              {kinds.map(({ id, label, Icon }) => (
                <motion.button
                  key={id}
                  whileHover={reduce ? {} : { y: -2, scale: 1.02 }}
                  whileTap={{ scale: reduce ? 1 : 0.96 }}
                  onClick={() => setKind(id)}
                >
                  <Icon size={16} />
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
          <div className="date-ticket" aria-hidden>
            <div>
              <i />
              <i />
            </div>
            <small>
              {new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'Asia/Shanghai' })
                .format(now)
                .toUpperCase()}
            </small>
            <b>{today.slice(8)}</b>
            <em>星期{weekdays[weekdayOf(today) - 1]}</em>
          </div>
        </motion.section>
        <div className="workspace-grid">
          <motion.aside variants={stagger} className="left-stack">
            <section className="card now-card">
              <div className="card-heading">
                <h2>此刻的团队动态</h2>
                <UsersRound size={18} />
              </div>
              {active.length ? (
                active.map((e) => (
                  <p className="notice-row" key={e.id}>
                    <b>{person(e.id)}</b>
                    <span>{displayText(e.event.type)}</span>
                  </p>
                ))
              ) : (
                <div className="quiet">
                  <span className="availability">
                    <Sunrise size={14} />
                    {cal.data ? '全员在岗，一切安好～' : cal.error ? '读取失败' : '读取中'}
                  </span>
                  <p>{cal.data ? 'Alpha Pulse 一定会更大更强' : cal.error || '正在读取知会…'}</p>
                </div>
              )}
              <p className="daily-quote"><small>今日暖心语录</small>{dailyQuote(now)}</p>
            </section>
            <DutyDuckStage key={date} selectedDate={date} />
          </motion.aside>
          <motion.section variants={stagger} className="card month-card">
            <div className="month-top">
              <div>
                <span className="section-label">
                  <CalendarDays size={15} />
                  团队月历
                </span>
                <h2>
                  {Number(month.slice(5))}月 <small>{month.slice(0, 4)}</small>
                </h2>
              </div>
              <div className="month-nav">
                <button aria-label="上个月" onClick={() => move(-1)}>
                  <ChevronLeft />
                </button>
                <button onClick={() => select(today)}>今天</button>
                <button aria-label="下个月" onClick={() => move(1)}>
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="week-row">
              {[...weekdays].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="month-grid"
                key={month}
                initial={{ opacity: 0, x: reduce ? 0 : direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduce ? 0 : -direction * 24 }}
                transition={{ duration: reduce ? 0 : 0.22 }}
              >
                {days.map((d) => {
                  const holiday = cal.data?.holidays.find((h) => h.date === d),
                    listed = onDay(d);
                  return (
                    <button
                      key={d}
                      className={
                        (d.startsWith(month) ? '' : 'muted ') +
                        (d === today ? 'today ' : '') +
                        (d === date ? 'selected' : '')
                      }
                      onClick={() => select(d)}
                      aria-label={d}
                      aria-pressed={d === date}
                    >
                      {d === date && <motion.i className="selected-ring" layoutId="selected-day-ring" />}
                      <b>{Number(d.slice(8))}</b>
                      {holiday && <small>{displayText(holiday.type)}</small>}
                      {listed.length > 0 && <i className="event-dot" />}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
            <div className="day-summary">
              <div>
                <strong>
                  {Number(date.slice(5, 7))} 月 {Number(date.slice(8))} 日
                </strong>
                <span>星期{weekdays[weekdayOf(date) - 1]}</span>
              </div>
              {cal.error ? (
                <button onClick={() => refresh((i) => i + 1)}>加载失败 · 重试</button>
              ) : chosen.length ? (
                chosen.map((e) => (
                  <p key={e.id}>
                    {e.userIds.map(person).join('、')} · {displayText(e.type)}
                  </p>
                ))
              ) : (
                <p>{cal.data ? '这一天还没有知会。' : '正在读取登记…'}</p>
              )}
            </div>
          </motion.section>
        </div>
        <footer>
          鸭鸭日历 <span>北京时间 UTC+8</span>
          {user.role === 'admin' && (
            <Link to="/release-announcement">
              版本知会 <ArrowUpRight size={12} />
            </Link>
          )}
        </footer>
      </motion.main>
      <FestivalPanel
        open={panel}
        close={() => setPanel(false)}
        preview={preview}
        onPreview={setPreview}
        rows={settings.data || []}
        onSaved={() => refresh((i) => i + 1)}
      />
      <Dialog
        open={!!kind}
        onOpenChange={(v) => {
          if (!v && !busy) setKind(null);
        }}
      >
        <DialogContent className="registration-panel">
          <DialogHeader>
            <DialogTitle>{kind && title[kind]}</DialogTitle>
            <DialogDescription>{kind === 'late' ? '10 点以后到达公司，可提前选好日期和预计到达时间'
              : kind === 'early' ? '今天提前出发，记得和 Mentor 打声招呼' : '请假或出差前，给 Mentor 和人事捎个信。'}</DialogDescription>
          </DialogHeader>
          {kind && cfg.data ? (
            <RegisterForm
              key={user.open_id + kind}
              actor={user.open_id}
              kind={kind}
              config={cfg.data}
              onDone={registrationDone}
              onBusy={setBusy}
              onClose={() => setKind(null)}
            />
          ) : (
            <p role="status">{cfg.error || '正在读取人事配置…'}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
