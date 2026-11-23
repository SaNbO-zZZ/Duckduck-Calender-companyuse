import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { axiosForBackend, explain, PersonSelect, useResource, useUser } from '../../lib/client';
import {
  dutyAssetManifest,
  resolveDutyDuckKey,
  weeklyDutyDuckKeys,
} from '../../../../shared/duty-assets';
import { type DutySelection, weekdayOf } from '../../../../shared/duty-calendar';
type Day = DutySelection & { personName?: string; personValid: boolean };
const sequence = [
  ['react', 2, 440],
  ['walkLeft', 3, 660],
  ['peek', 2, 440],
  ['jump', 2, 440],
] as const;
export function DutyDuckStage({ selectedDate }: { selectedDate: string }) {
  const user = useUser(),
    { data: day, error } = useResource<Day>('/api/duty/day?date=' + selectedDate);
  const [step, setStep] = useState(-1),
    [frame, setFrame] = useState(0),
    [message, setMessage] = useState(''),
    [open, setOpen] = useState(false),
    [invite, setInvite] = useState(''),
    [busy, setBusy] = useState(false);
  const replayKey = useRef(''),
    playing = useRef(false);
  const roleKey =
      resolveDutyDuckKey(day?.duty?.duckKey || '') || weeklyDutyDuckKeys[weekdayOf(selectedDate) - 1],
    role = dutyAssetManifest.roles[roleKey];
  useEffect(() => {
    if (step < 0) return;
    const [, , duration] = sequence[step];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = window.setInterval(() => setFrame((f) => f + 1), duration / sequence[step][1]);
    const next = window.setTimeout(
      () => {
        setFrame(0);
        if (step === 3) {
          setStep(-1);
          playing.current = false;
          setMessage('巡场完成，今天也辛苦啦。');
        } else setStep(step + 1);
      },
      reduce ? 85 : duration,
    );
    return () => {
      clearInterval(tick);
      clearTimeout(next);
    };
  }, [step]);
  const action = sequence[step],
    count = action?.[1] || 6;
  const { data: tomorrow } = useResource<Day>('/api/duty/day?date=' + nextDate(selectedDate));
  const canInvite =
    day?.personValid &&
    day.duty?.personId === user.open_id &&
    Date.now() < Date.parse(selectedDate + 'T16:00:00+08:00');
  async function create() {
    if (!invite || busy) return;
    setBusy(true);
    try {
      const r = await axiosForBackend.post('/api/duty/exchange-requests', {
        dutyDate: selectedDate,
        inviteeId: invite,
        requestId: replayKey.current,
      });
      location.assign(r.data.openUrl);
    } catch (e) {
      setMessage(explain(e));
    } finally {
      setBusy(false);
    }
  }
  const label = day?.personName || (error ? '排班加载失败' : day ? '暂无值日安排' : '读取中…');
  return (
    <section className="card duty" data-duty-stage>
      <div className="card-heading">
        <h2>值日鸭鸭</h2>
        <span className="little-date">{selectedDate.slice(5).replace('-', ' / ')}</span>
      </div>
      <div className="stage-floor">
        <button
          className="duty-sprite"
          data-action={action?.[0] || 'idle'}
          aria-label={'播放' + label + '的巡场动作'}
          disabled={!day?.duty || !!action}
          onClick={() => {
            if (!playing.current) {
              playing.current = true;
              setMessage('');
              setFrame(0);
              setStep(0);
            }
          }}
          style={{
            backgroundImage: 'url(' + (action ? role.actionSheets[action[0]] : role.spriteSheet) + ')',
            backgroundSize: action ? count * 100 + '% 100%' : '600% 600%',
            backgroundPosition: action ? ((frame % count) * 100) / (count - 1) + '% 0' : '0 0',
          }}
        />
        <div>
          <strong>{label}</strong>
          <small>
            {day?.duty
              ? '周' + '一二三四五六日'[weekdayOf(selectedDate) - 1] + '值日负责人'
              : '排班状态'}
          </small>
        </div>
      </div>
      <p className="stage-caption" aria-live="polite">
        <Play size={13} />
        {action
          ? ['收到！', '出发巡场', '探头看看', '收工啦'][step]
          : message || error || (day?.duty ? '点击鸭鸭，看它巡场' : '当天暂无可展示的值日安排')}
      </p>
      {action && day?.queue?.length > 0 && (
        <div className="duck-queue" aria-label="巡场队列">
          {day.queue.map((d) => (
            <img
              key={d}
              alt={'周' + '一二三四五六日'[d - 1]}
              src={dutyAssetManifest.roles[weeklyDutyDuckKeys[d - 1]].assetPath}
            />
          ))}
        </div>
      )}
      <div className="stage-footer">
        <span>下班次 · {tomorrow?.personName || '待排班'}</span>
        <button
          disabled={!canInvite}
          onClick={() => {
            setMessage('');
            setInvite('');
            replayKey.current = crypto.randomUUID();
            setOpen(true);
          }}
        >
          <ArrowLeftRight size={14} />
          换班
        </button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发起换班</DialogTitle>
            <DialogDescription>
              {selectedDate} · 选择接班人，确认后会向对方发送飞书私聊。
            </DialogDescription>
          </DialogHeader>
          <PersonSelect
            label="选择接班人"
            value={invite}
            exclude={user.open_id}
            onChange={(id) => {
              setInvite(id);
              replayKey.current = crypto.randomUUID();
            }}
          />
          {message && <p role="alert">{message}</p>}
          <button className="primary" disabled={!invite || busy} onClick={create}>
            创建并打开确认页
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
import { addBeijingDays } from '../../../../shared/duty-calendar';
function nextDate(day: string) {
  return addBeijingDays(day, 1);
}
