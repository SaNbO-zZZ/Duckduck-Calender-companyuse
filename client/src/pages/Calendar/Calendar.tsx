import { displayText } from '../../lib/display-text';
import { type SkyBand, skyAt } from '../../../../shared/hefei-sky';
import { dailyQuote } from '../../../../shared/daily-quotes';
import { classifyPresence } from '../../../../shared/calendar-presence';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Plane,
  Sun,
  Sunrise,
  UsersRound,
  Quote,
  Wind,
  ClipboardPenLine,
} from 'lucide-react';
import { beijingDate } from '../../../../shared/duty-calendar';
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
import { MonthCard } from './MonthCard';
import {
  WeatherMenu,
  livePreview,
  previewTime,
  previewWeather,
} from './WeatherMenu';

const phone = matchMedia('(max-width: 768px)');
const subscribeSize = (listener: () => void) => {
  phone.addEventListener('change', listener);
  return () => phone.removeEventListener('change', listener);
};
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
  const mobile = useSyncExternalStore(subscribeSize, () => phone.matches);
  const user = useUser(),
    [now, setNow] = useState(Date.now),
    today = beijingDate(now);
  const [month, setMonth] = useState(today.slice(0, 7)),
    [date, setDate] = useState(today);
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
    [atmosphere, setAtmosphere] = useState(livePreview),
    reduce = useReducedMotion();
  const cal = useResource<CalendarData>(
      '/api/calendar/month?month=' + month,
      rev,
    ),
    cfg = useResource<CalendarConfig>('/api/calendar/config', rev),
    liveWeather = useResource<WeatherData>(
      '/api/calendar/weather',
      weatherRev,
    ).data,
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
  const time =
    atmosphere.time === '实时' && preview
      ? preview.night
        ? '夜晚'
        : '正午'
      : atmosphere.time;
  const sky = useMemo(() => skyAt(previewTime(now, time)), [now, time]);
  const weather = useMemo(
    () => previewWeather(liveWeather, atmosphere),
    [liveWeather, atmosphere],
  );
  const phase = sky.phase,
    night = phase === 'night';
  const localWeather =
    atmosphere.time !== '实时' ||
    atmosphere.sky !== '实时' ||
    atmosphere.wind >= 0;
  const WeatherIcon =
    weather?.precipType === 'rain'
      ? CloudRain
      : weather?.precipType === 'snow'
        ? CloudSnow
        : weather?.scene === 'overcast'
          ? Cloud
          : night
            ? Moon
            : weather?.scene === 'partly'
              ? CloudSun
              : Sun;
  const bar = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [skyBand, setSkyBand] = useState<SkyBand>({ top: 74, bottom: 170 });
  useEffect(() => {
    const el = bar.current!;
    const measure = () => {
      const planner = el.parentElement!;
      const scroll = window.scrollY + planner.scrollTop;
      const top = Math.ceil(el.getBoundingClientRect().bottom + scroll);
      const bottom = Math.floor(
        stage.current!.getBoundingClientRect().top + scroll,
      );
      setSkyBand((old) =>
        old.top === top && old.bottom === bottom ? old : { top, bottom },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(el.parentElement!);
    measure();
    return () => observer.disconnect();
  }, [preview]);
  const theme = festivals.find((f) =>
    preview
      ? f.key === preview.key
      : settings.data?.some((r) => r.key === f.key && r.enabled) &&
        inFestival(f.key, today),
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
  ]
    .filter(Boolean)
    .join('，');
  useEffect(() => {
    if (Number.isFinite(presence.nextTransition)) {
      const t = setTimeout(
        () => setNow(Date.now()),
        Math.max(1, presence.nextTransition - Date.now() + 1),
      );
      return () => clearTimeout(t);
    }
  }, [presence.nextTransition]);
  const person = (id: string) =>
    displayText(cal.data?.people.find((p) => p.id === id)?.name || '') ||
    '团队成员';
  function select(d: string) {
    setDate(d);
    setMonth(d.slice(0, 7));
  }
  function move(delta: number) {
    const m = changeMonth(month, delta);
    select(m === today.slice(0, 7) ? today : m + '-01');
  }
  const actions = kinds.map(({ id, label, Icon }) => (
    <button key={id} onClick={() => setKind(id)}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  ));
  const stagger = {
    hidden: { opacity: 1, y: reduce ? 0 : 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring' as const, stiffness: 300, damping: 26 },
    },
  };
  return (
    <div
      className={'calendar-app ' + (night ? 'is-night' : '')}
      data-night={night}
      data-festival={theme?.key || 'regular'}
      style={{
        '--accent': theme?.color || '#407c67',
        '--wash': theme?.light || '#e1eedc',
        '--night': theme?.night || '#263b49',
      }}
    >
      <Sky
        band={skyBand}
        sky={sky}
        theme={theme?.key}
        weather={weather}
        night={night}
      />
      <Particles
        theme={theme?.key}
        night={night}
        ambient
        dusk={phase === 'dusk'}
        wind={(weather?.windSpeed ?? 0) * (weather?.windDir ?? 1)}
        rain={weather?.precipType === 'rain' ? weather.precipLevel : 0}
        snow={weather?.precipType === 'snow' ? weather.precipLevel : 0}
      />
      <main className="planner-shell">
        <header ref={bar} className="planner-bar">
          <Link className="planner-brand" to="/">
            <svg
              viewBox="0 0 40 40"
              aria-hidden="true"
              width="37"
              height="37"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 22c3 2 5 2 8 1-2-2-3-5-2-8 1-4 5-7 9-6 4 0 7 3 7 7l6 2-6 3c-1 7-6 11-13 10-6 0-10-5-9-9Z" />
              <path d="M12 24c2 3 6 4 10 1" />
              <circle
                cx="23.5"
                cy="15"
                r="1.25"
                fill="currentColor"
                stroke="none"
              />
            </svg>
            <strong>鸭鸭日历</strong>
          </Link>
          <div className="planner-weather" aria-label="合肥天气">
            <WeatherIcon size={19} />
            <span>
              {localWeather ? '预览' : '合肥'} ·{' '}
              {weather?.temperature != null &&
                Math.round(weather.temperature) + '°C '}
              {weather?.description || '暖晴'}
            </span>
            {weather?.windLevel >= 2 && (
              <span className="wind-tag">
                <Wind size={13} />
                {weather.windLevel === 3 ? '强风' : '大风'}
              </span>
            )}
          </div>
          <nav>
            <Link className="desktop-charter" to="/charter">
              <BookOpen size={16} />
              鸭鸭公约
            </Link>
            <WeatherMenu
              value={atmosphere}
              onChange={(v) => {
                setAtmosphere(v);
                if (v === livePreview) setPreview(null);
              }}
              night={night}
              admin={user.role === 'admin'}
              onFestival={() => setPanel(true)}
            />
            <span className="avatar" title={user.name}>
              {user.avatar_url ? (
                <img alt={user.name} src={user.avatar_url} />
              ) : (
                user.name?.slice(0, 1)
              )}
            </span>
          </nav>
        </header>
        {preview && (
          <aside className="preview-strip">
            {theme?.name} · {night ? '夜晚' : '白天'}预览
            <button onClick={() => setPanel(true)}>切换</button>
            <button onClick={() => setPreview(null)}>结束预览</button>
          </aside>
        )}
        <div className="planner-columns">
          <div className="month-column">
            <div ref={stage} className="duck-stage" aria-label="天气鸭舞台">
              <WeatherDucks
                weather={weather}
                phase={phase}
                halloween={theme?.key === 'halloween'}
              />
            </div>
            <MonthCard
              month={month}
              date={date}
              today={today}
              data={cal.data}
              error={cal.error}
              mobile={mobile}
              night={night}
              select={select}
              move={move}
              retry={() => refresh((i) => i + 1)}
            />
          </div>
          <motion.aside
            className="planner-side"
            initial="hidden"
            animate="show"
            variants={stagger}
          >
            <DutyDuckStage key={date} selectedDate={date} />
            <section className="card team-card">
              <div className="card-heading">
                <h2>此刻团队动态</h2>
                <UsersRound size={18} />
              </div>
              {active.length ? (
                <>
                  <p className="team-summary">{summary}</p>
                  <ul>
                    {active.map((e) => (
                      <li key={e.id}>
                        <b>{person(e.id)}</b>
                        <span>{displayText(e.event.type)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="team-empty">
                  <strong>
                    {cal.data
                      ? 'Alpha Pulse 一定会更大更强'
                      : cal.error || '正在读取团队知会…'}
                  </strong>
                  {cal.data && <small>全员在岗，一切安好～</small>}
                </div>
              )}
              <div className="quote-line">
                <Quote size={16} />
                <p>
                  <small>今日暖心语录</small>
                  {dailyQuote(now)}
                </p>
              </div>
            </section>
            {!mobile && (
              <section className="card quick-card">
                <div className="card-heading">
                  <h2>今日状态</h2>
                  <ClipboardPenLine size={18} />
                </div>
                <div className="register-actions">{actions}</div>
              </section>
            )}
          </motion.aside>
        </div>
        <footer className="planner-foot">
          <span>北京时间 UTC+8</span>
          {user.role === 'admin' && (
            <Link to="/release-announcement">
              版本知会 <ArrowUpRight size={13} />
            </Link>
          )}
        </footer>
      </main>
      {mobile && (
        <nav className="phone-dock" aria-label="今日状态">
          <div className="register-actions">{actions}</div>
        </nav>
      )}
      <FestivalPanel
        open={panel}
        close={() => setPanel(false)}
        preview={preview}
        onPreview={(v) => {
          setPreview(v);
          setAtmosphere((a) => ({ ...a, time: '实时' }));
        }}
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
            <DialogDescription>
              {kind === 'late'
                ? '10 点以后到达公司，可提前选好日期和预计到达时间'
                : kind === 'early'
                  ? '今天提前出发，记得和 Mentor 打声招呼'
                  : '请假或出差前，给 Mentor 和人事捎个信。'}
            </DialogDescription>
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
