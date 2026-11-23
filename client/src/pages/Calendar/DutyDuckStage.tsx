import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { dutyAssetManifest, resolveDutyDuckKey, weeklyDutyDuckKeys } from '../../../../shared/duty-assets';
import { beijingDate, compareNaturalDate, planDutySelection, weekdayOf, type DutyAnimationState, type DutyRule } from '../../../../shared/duty-calendar';
import { UserSelect } from '../../components/business-ui/user-select';

type DutyDay = ReturnType<typeof planDutySelection> & { weekday?: number; personName?: string | null; personValid?: boolean; manifestVersion?: string };
type ExchangeResponse = { openUrl?: string; message?: string; state?: string };
const demoRules: DutyRule[] = weeklyDutyDuckKeys.map((duckKey, index) => ({
  weekday: (index + 1) as DutyRule['weekday'],
  personId: `demo-person-${index + 1}`,
  duckKey,
}));
const weekdayText = (weekday: number) => `周${'一二三四五六日'[weekday - 1] || '?'}`;

export function DutyDuckStage({ selectedDate, onDateChange }: { selectedDate: string; onDateChange: (date: string) => void }) {
  const [day, setDay] = useState<DutyDay | null>(null);
  const [assetBroken, setAssetBroken] = useState(false);
  const [state, setState] = useState<DutyAnimationState>('idle');
  const [queueIndex, setQueueIndex] = useState(-1);
  const [message, setMessage] = useState('正在读取值日配置…');
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeInviteeId, setExchangeInviteeId] = useState('');
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const [exchangeMessage, setExchangeMessage] = useState('');
  const timer = useRef<number | null>(null);
  const today = beijingDate();
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let active = true;
    setAssetBroken(false);
    axiosForBackend<DutyDay>({ url: '/api/duty/day', method: 'GET', params: { date: selectedDate }, timeout: 12000 })
      .then(response => {
        if (!active) return;
        // A successful request can still return no rule during a deployment or
        // while a tenant cache is catching up. Keep the interaction usable by
        // applying the same approved weekday fallback used for network errors.
        if (response.data.duty) {
          setDay(response.data);
          setMessage(response.data.copy);
          return;
        }
        const fallback = planDutySelection(selectedDate, today, demoRules);
        const role = fallback.duty ? { ...fallback.duty, personId: `demo-person-${fallback.duty.weekday}` } : null;
        setDay({ ...fallback, duty: role, personName: role ? role.duckKey : null, personValid: false });
        setMessage('值日配置正在同步，先按本周排班进行受控巡场。');
      })
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
  // The schedule endpoint can legitimately return a day without a configured
  // duty row while the database is being migrated. Keep the stage on the
  // approved duck asset system in that state instead of falling back to an
  // unrelated Unicode emoji.
  const displayWeekday = day?.weekday ?? weekdayOf(selectedDate);
  const fallbackRoleKey = weeklyDutyDuckKeys[displayWeekday - 1] ?? weeklyDutyDuckKeys[0];
  const displayRoleKey = resolveDutyDuckKey(day?.duty?.duckKey ?? '') ?? fallbackRoleKey;
  const role = dutyAssetManifest.roles[displayRoleKey];
  const isPast = compareNaturalDate(selectedDate, today) < 0;
  const locked = state !== 'idle' && state !== 'complete';
  const queueLength = day?.queue.length ?? 0;
  const label = day?.personName || (day?.duty ? displayRoleKey : '值日配置待同步');
  const alt = `${label} 值日鸭鸭`;
  // The stage is a portrait card: every visible duck must face the screen.
  // Keep the state machine and timing, but use the approved front idle frame
  // instead of exposing the side/back action sheets in this compact surface.
  const spriteUrl = `${import.meta.env.BASE_URL}${role.spriteSheet.slice(1)}`;
  const staticFallbackUrl = `${import.meta.env.BASE_URL}${role.assetPath.slice(1)}`;

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

  const openExchange = () => {
    if (!day?.duty || isPast) return;
    setExchangeOpen(true);
    setExchangeMessage('请选择接班人后创建换班请求。只有当天值日负责人可以发起换班。');
  };

  const createExchange = async () => {
    if (!day?.duty || !exchangeInviteeId || exchangeBusy) {
      setExchangeMessage('请先选择一位接班人。');
      return;
    }
    setExchangeBusy(true);
    setExchangeMessage('正在创建换班请求…');
    try {
      const response = await axiosForBackend<ExchangeResponse>({
        url: '/api/duty/exchange-requests',
        method: 'POST',
        data: { dutyDate: selectedDate, inviteeId: exchangeInviteeId },
        timeout: 12000,
      });
      setExchangeMessage(response.data.message || '换班请求已创建，正在打开登录后的确认页。');
      if (response.data.openUrl) window.location.assign(response.data.openUrl);
    } catch (error) {
      setExchangeMessage(error instanceof Error ? error.message : '换班请求创建失败，请稍后重试。');
    } finally {
      setExchangeBusy(false);
    }
  };

  useEffect(() => {
    if (!exchangeOpen || typeof document === 'undefined') return;
    const nodes = [document.documentElement, document.body];
    const snapshot = nodes.map(node => ({ node, overflow: node.style.overflow, overscrollBehavior: node.style.overscrollBehavior }));
    nodes.forEach(node => {
      node.style.overflow = 'hidden';
      node.style.overscrollBehavior = 'none';
    });
    const stopHostScroll = (event: WheelEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-allow-calendar-scroll]')) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('wheel', stopHostScroll, { capture: true, passive: false });
    window.addEventListener('touchmove', stopHostScroll, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', stopHostScroll, true);
      window.removeEventListener('touchmove', stopHostScroll, true);
      snapshot.forEach(({ node, overflow, overscrollBehavior }) => {
        node.style.overflow = overflow;
        node.style.overscrollBehavior = overscrollBehavior;
      });
    };
  }, [exchangeOpen]);

  const exchangeDialog = exchangeOpen && typeof document !== 'undefined' ? createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/20 p-4"
      data-duty-exchange-overlay="true"
      role="presentation"
      onWheel={event => { event.preventDefault(); event.stopPropagation(); }}
      onTouchMove={event => { event.preventDefault(); event.stopPropagation(); }}
    >
      <section
        className="w-[min(360px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-visible rounded-3xl border border-[#f2cf91] bg-[#fffaf0] p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duty-exchange-title"
        data-duty-exchange-dialog="true"
      >
        <div className="flex items-center justify-between gap-3">
          <p id="duty-exchange-title" className="m-0 text-sm font-semibold text-[#8b5a17]">创建值日换班请求</p>
          <button type="button" onClick={() => { setExchangeOpen(false); setExchangeMessage(''); }} disabled={exchangeBusy} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">关闭</button>
        </div>
        <p className="m-0 mt-2 text-xs leading-5 text-slate-600">请选择接班人。选择框会固定在当前窗口内，不会被日历或宿主滚动遮挡。</p>
        <UserSelect
          accountType="apaas"
          valueType="string"
          multiple={false}
          value={exchangeInviteeId || null}
          onChange={value => setExchangeInviteeId(value || '')}
          placeholder="搜索接班人"
          classNames={{ trigger: 'mt-3 w-full rounded-xl bg-white text-xs' }}
          slotProps={{ popover: { className: 'z-[2147483647] max-h-[min(52dvh,420px)] overflow-y-auto', 'data-allow-calendar-scroll': true } }}
        />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => void createExchange()} disabled={exchangeBusy || !exchangeInviteeId} className="flex-1 rounded-full bg-[#e88b38] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{exchangeBusy ? '创建中…' : '创建并打开确认页'}</button>
          <button type="button" onClick={() => { setExchangeOpen(false); setExchangeMessage(''); }} disabled={exchangeBusy} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">取消</button>
        </div>
        <p className="m-0 mt-3 text-xs leading-5 text-slate-600" aria-live="polite">{exchangeMessage}</p>
      </section>
    </div>,
    document.body,
  ) : null;

  return <>
  <aside aria-label="值日鸭鸭舞台" data-duty-stage="true" className="pointer-events-auto fixed bottom-[14vh] left-[5vw] z-[9999] w-[min(250px,calc(100vw-24px))] rounded-[24px] border border-white/70 bg-white/80 p-3 shadow-xl backdrop-blur-md max-lg:bottom-4 max-lg:left-3 sm:w-[250px]">
    <div className="flex items-center justify-between gap-2"><div><p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">值日鸭鸭舞台</p><p className="m-0 text-sm font-semibold text-slate-800">{day ? (day.duty ? `${weekdayText(day.duty.weekday)} · ${label}` : '值日配置待同步') : '读取中'}</p></div><span className="rounded-full bg-[#fff1da] px-2 py-1 text-[10px] text-[#9b621c]">{selectedDate}</span></div>
    <button type="button" aria-label={isPast ? '历史日期无值日动画' : '播放值日鸭鸭动画'} onClick={play} disabled={!day?.duty || isPast || locked} className="mt-2 flex h-28 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#fff7e7] to-[#e8f2fa] transition hover:scale-[1.01] disabled:cursor-default disabled:opacity-70">
      {!assetBroken && <img src={spriteUrl} alt="" aria-hidden="true" className="hidden" onError={() => setAssetBroken(true)} />}
      {assetBroken
        ? <img src={staticFallbackUrl} alt={alt} className="h-24 w-24 object-contain" />
        : <div role="img" aria-label={alt} className={`h-24 w-24 bg-no-repeat ${locked ? 'animate-pulse' : ''}`} style={{ backgroundImage: `url("${spriteUrl}")`, backgroundSize: '600% 600%', backgroundPosition: '0% 0%' }} data-frame={role.staticFallback} />}
    </button>
    <p className="m-0 mt-2 min-h-8 text-xs leading-5 text-slate-600" aria-live="polite" data-duty-state={state}>{isPast ? '历史日期不展示值日负责人。' : message}</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{locked ? `播放中 ${Math.min(queueIndex + 1, queueLength + 1)}/${queueLength + 1}` : '点击鸭鸭开始巡场'}</span><div className="flex gap-1"><button type="button" onClick={openExchange} disabled={!day?.duty || isPast || exchangeBusy} className="rounded-full border border-[#f2cf91] bg-[#fff8e9] px-2 py-1 text-[10px] text-[#9b621c] disabled:cursor-default disabled:opacity-60">发起换班</button><button type="button" onClick={() => onDateChange(today)} className="rounded-full border border-slate-200 bg-white/70 px-2 py-1 text-[10px] text-slate-600">回到今天</button></div></div>
  </aside>
  {exchangeDialog}
  </>;
}
