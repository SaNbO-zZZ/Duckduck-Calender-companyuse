import React, { useEffect, useMemo, useRef, useState } from 'react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { dutyAssetManifest } from '../../../../shared/duty-assets';
import { beijingDate, compareNaturalDate, planDutySelection, type DutyAnimationState, type DutyRule } from '../../../../shared/duty-calendar';

type DutyDay = ReturnType<typeof planDutySelection> & { personName?: string | null; personValid?: boolean; manifestVersion?: string };
const demoRules: DutyRule[] = [1, 2, 3, 4, 5, 6, 7].map((weekday, index) => ({ weekday: weekday as DutyRule['weekday'], personId: `demo-person-${weekday}`, duckKey: ['mia', 'momo', 'zhangsanbo', 'barra', 'ziyu', 'jiajia', 'billy'][index] }));
const weekdayText = (weekday: number) => `周${'一二三四五六日'[weekday - 1] || '?'}`;

export function DutyDuckStage({ selectedDate, onDateChange }: { selectedDate: string; onDateChange: (date: string) => void }) {
  const [day, setDay] = useState<DutyDay | null>(null);
  const [assetBroken, setAssetBroken] = useState(false);
  const [state, setState] = useState<DutyAnimationState>('idle');
  const [queueIndex, setQueueIndex] = useState(-1);
  const [message, setMessage] = useState('正在读取值日配置…');
  const timer = useRef<number | null>(null);
  const today = beijingDate();
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let active = true;
    setAssetBroken(false);
    axiosForBackend<DutyDay>({ url: '/api/duty/day', method: 'GET', params: { date: selectedDate }, timeout: 12000 })
      .then(response => { if (active) { setDay(response.data); setMessage(response.data.copy); } })
      .catch(() => {
        if (!active) return;
        const fallback = planDutySelection(selectedDate, today, demoRules);
        const role = fallback.duty ? { ...fallback.duty, personId: `demo-person-${fallback.duty.weekday}` } : null;
        setDay({ ...fallback, duty: role, personName: role ? role.duckKey : null, personValid: false });
        setMessage(fallback.copy);
      });
    return () => { active = false; };
  }, [selectedDate, today]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const role = day?.duty?.duckKey ? dutyAssetManifest.roles[day.duty.duckKey] : undefined;
  const isPast = compareNaturalDate(selectedDate, today) < 0;
  const locked = state !== 'idle' && state !== 'complete';
  const queueLength = day?.queue.length ?? 0;
  const label = day?.personName || day?.duty?.duckKey || '值日配置待同步';
  const alt = `${label} 值日鸭鸭`;
  const frame = useMemo(() => {
    if (!role) return '';
    if (state === 'reacting') return role.actions.react[queueIndex % role.actions.react.length] || role.thumbnail;
    if (state === 'walking' || state === 'queueing') return role.actions.walkLeft[queueIndex % role.actions.walkLeft.length] || role.thumbnail;
    if (state === 'peek') return role.actions.peek[queueIndex % role.actions.peek.length] || role.thumbnail;
    if (state === 'complete') return role.actions.jump[queueIndex % role.actions.jump.length] || role.thumbnail;
    return role.thumbnail;
  }, [role, state, queueIndex]);
  const frameIndex = useMemo(() => {
    if (!role) return 0;
    if (state === 'walking' || state === 'queueing') return 9 + (queueIndex % 9);
    if (state === 'peek') return 27 + (queueIndex % 4);
    if (state === 'complete') return 31 + (queueIndex % 5);
    return 9;
  }, [role, state, queueIndex]);
  const spritePosition = `${(frameIndex % 6) * 20}% ${Math.floor(frameIndex / 6) * 20}%`;
  const actionKey = state === 'reacting' ? 'react' : state === 'walking' || state === 'queueing' ? 'walkLeft' : state === 'peek' ? 'peek' : state === 'complete' ? 'jump' : null;
  const actionCount = actionKey === 'walkLeft' ? 3 : actionKey ? 2 : 0;
  const actionIndex = actionCount ? Math.max(0, queueIndex) % actionCount : 0;
  const actionPosition = actionCount ? `${(actionIndex / (actionCount - 1)) * 100}% 0%` : '0% 0%';
  const actionSize = actionCount ? `${actionCount * 100}% 100%` : '600% 600%';
  const assetFolder = day?.duty?.duckKey === 'mia' ? 'caishen' : day?.duty?.duckKey === 'momo' ? 'cockroach' : day?.duty?.duckKey === 'zhangsanbo' ? 'beer' : day?.duty?.duckKey === 'barra' ? 'esports' : day?.duty?.duckKey === 'ziyu' ? 'lion' : day?.duty?.duckKey === 'jiajia' ? 'racing' : 'kunduck';
  // Local dev mirrors the uploaded Miaoda file-storage object; release/runtime keeps the remote object URL.
  const spriteUrl = role && (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? `./runtime-assets/duty-ducks-v2/${assetFolder}/${actionKey ? `actions/${actionKey === 'walkLeft' ? 'walk-left' : actionKey}-sheet.png` : 'idle-sprite-6x6.png'}`
    : actionKey && role ? role.actionSheets[actionKey] : role?.spriteSheet;
  const backgroundPosition = actionKey ? actionPosition : spritePosition;
  const localAssetRoot = `./runtime-assets/duty-ducks-v2/${assetFolder}`;
  const staticFallbackUrl = role && (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? `${localAssetRoot}/idle-00.png` : role?.assetPath;

  const play = () => {
    if (!day?.duty || isPast || locked || day.mode === 'hidden') return;
    if (day.mode === 'dialogue') {
      setState('reacting'); setQueueIndex(0); setMessage('我记得，我会好好铲屎。');
      timer.current = window.setTimeout(() => { setState('complete'); timer.current = window.setTimeout(() => setState('idle'), 500); }, reducedMotion ? 250 : 950);
      return;
    }
    setState('reacting'); setQueueIndex(0); setMessage('收到，开始值日鸭鸭巡场…');
    const step = reducedMotion ? 110 : 360;
    const total = 5 + queueLength;
    const advance = (index: number) => {
      setQueueIndex(index);
      if (index === 0) setState('reacting');
      else if (index === 1) setState('walking');
      else if (index < total - 1) setState('queueing');
      else if (index === total - 1) setState('peek');
      else { setState('complete'); setMessage('值日队列完成，鸭鸭继续待机。'); timer.current = window.setTimeout(() => setState('idle'), reducedMotion ? 80 : 420); return; }
      timer.current = window.setTimeout(() => advance(index + 1), step);
    };
    timer.current = window.setTimeout(() => advance(1), step);
  };

  return <aside aria-label="值日鸭鸭舞台" className="pointer-events-auto absolute left-3 top-3 z-20 w-[min(250px,calc(100vw-24px))] rounded-[24px] border border-white/70 bg-white/80 p-3 shadow-xl backdrop-blur-md sm:left-5 sm:top-5">
    <div className="flex items-center justify-between gap-2"><div><p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">值日鸭鸭舞台</p><p className="m-0 text-sm font-semibold text-slate-800">{day?.duty ? `${weekdayText(day.duty.weekday)} · ${label}` : '读取中'}</p></div><span className="rounded-full bg-[#fff1da] px-2 py-1 text-[10px] text-[#9b621c]">{selectedDate}</span></div>
    <button type="button" aria-label={isPast ? '历史日期无值日动画' : '播放值日鸭鸭动画'} onClick={play} disabled={!day?.duty || isPast || locked} className="mt-2 flex h-28 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#fff7e7] to-[#e8f2fa] transition hover:scale-[1.01] disabled:cursor-default disabled:opacity-70">
      {role && spriteUrl && <img src={spriteUrl} alt="" aria-hidden="true" className="hidden" onError={() => setAssetBroken(true)} />}
      {role && !assetBroken ? <div role="img" aria-label={alt} className={`h-24 w-24 bg-contain bg-center bg-no-repeat ${locked ? 'animate-pulse' : ''}`} style={{ backgroundImage: `url(${spriteUrl})`, backgroundSize: actionSize, backgroundPosition }} data-frame={frame || role.staticFallback} /> : role && staticFallbackUrl ? <img src={staticFallbackUrl} alt={alt} className="h-24 w-24 object-contain" /> : <span className="text-3xl" aria-hidden="true">🦆</span>}
    </button>
    <p className="m-0 mt-2 min-h-8 text-xs leading-5 text-slate-600">{isPast ? '历史日期不展示值日负责人。' : message}</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{locked ? `播放中 ${Math.min(queueIndex + 1, queueLength + 1)}/${queueLength + 1}` : '点击鸭鸭开始巡场'}</span><div className="flex gap-1"><button type="button" onClick={() => setMessage('请在值日换班助手单聊发送“我要换班”。当前本地运行时未接入入站回调。')} className="rounded-full border border-[#f2cf91] bg-[#fff8e9] px-2 py-1 text-[10px] text-[#9b621c]">发起换班</button><button type="button" onClick={() => onDateChange(today)} className="rounded-full border border-slate-200 bg-white/70 px-2 py-1 text-[10px] text-slate-600">回到今天</button></div></div>
  </aside>;
}
