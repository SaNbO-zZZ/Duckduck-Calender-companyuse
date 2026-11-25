import { displayText } from '../../lib/display-text';
import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { ArrowLeftRight, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import {
  axiosForBackend,
  explain,
  PersonSelect,
  useResource,
  useUser,
} from '../../lib/client';
import {
  dutyAssetManifest,
  resolveDutyDuckKey,
  weeklyDutyDuckKeys,
} from '../../../../shared/duty-assets';
import {
  type DutySelection,
  weekdayOf,
} from '../../../../shared/duty-calendar';
type Day = DutySelection & { personName?: string; personValid: boolean };
const sequence = [
  { name: 'react', start: 0, duration: 600, caption: '收到！' },
  { name: 'walkLeft', start: 600, duration: 1400, caption: '出发巡场' },
  { name: 'peek', start: 2000, duration: 900, caption: '探头看看' },
  { name: 'jump', start: 2900, duration: 1100, caption: '收工啦' },
] as const;
export function DutyDuckStage({ selectedDate }: { selectedDate: string }) {
  const user = useUser(),
    { data: day, error } = useResource<Day>(
      '/api/duty/day?date=' + selectedDate,
    );
  const [step, setStep] = useState(-1),
    [message, setMessage] = useState(''),
    [open, setOpen] = useState(false),
    [invite, setInvite] = useState(''),
    [busy, setBusy] = useState(false);
  const replayKey = useRef(''),
    playing = useRef(false);
  const roleKey =
      resolveDutyDuckKey(day?.duty?.duckKey || '') ||
      weeklyDutyDuckKeys[weekdayOf(selectedDate) - 1],
    role = dutyAssetManifest.roles[roleKey];
  const track = useRef<HTMLDivElement>(null),
    sprite = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0),
    y = useMotionValue(0),
    tilt = useMotionValue(0);
  const animation = useRef(0),
    loaded = useRef(new Map<string, HTMLImageElement>());
  const [prepared, setPrepared] = useState(false);
  useEffect(() => {
    let active = true;
    setPrepared(false);
    playing.current = false;
    setStep(-1);
    setMessage('');
    x.set(0);
    y.set(0);
    tilt.set(0);
    const sheets = new Map<string, HTMLImageElement>();
    Promise.all(
      Object.values(role.actionSheets).map(async (url) => {
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
          sheets.set(url, image);
        } catch {
          /* Keep the original portrait for a missing sheet. */
        }
      }),
    ).then(() => {
      if (active) {
        loaded.current = sheets;
        setPrepared(true);
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(animation.current);
    };
  }, [role, x, y, tilt]);
  const action = sequence[step];
  function patrol() {
    if (!prepared || playing.current || !sprite.current || !track.current)
      return;
    setMessage('');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMessage('巡场完成，今天也辛苦啦。');
      return;
    }
    playing.current = true;
    const start = performance.now(),
      button = sprite.current,
      rail = track.current;
    let previous = -1;
    function draw(now: number) {
      const ms = Math.max(0, now - start);
      if (ms >= 4000) {
        x.set(0);
        y.set(0);
        tilt.set(0);
        button.style.backgroundPosition = '0 0';
        playing.current = false;
        setStep(-1);
        setMessage('巡场完成，今天也辛苦啦。');
        return;
      }
      const index = ms < 600 ? 0 : ms < 2000 ? 1 : ms < 2900 ? 2 : 3;
      if (index !== previous) {
        setStep(index);
        previous = index;
      }
      const part = sequence[index],
        u = (ms - part.start) / part.duration;
      const ease = u * u * (3 - 2 * u),
        distance = Math.max(0, rail.clientWidth - button.offsetWidth - 14);
      x.set(-distance * [0, ease, 1, 1 - ease][index]);
      y.set(
        -[
          Math.sin(Math.PI * u) * 6,
          Math.abs(Math.sin(Math.PI * u * 7)) * 3,
          0,
          Math.sin(Math.PI * u) * 10,
        ][index],
      );
      tilt.set(
        index === 2
          ? Math.sin(u * Math.PI * 2) * 7
          : index === 1
            ? Math.sin(u * Math.PI * 7) * 3
            : 0,
      );
      const count = role.actions[part.name].length;
      button.style.backgroundPosition = loaded.current.has(
        role.actionSheets[part.name],
      )
        ? ((Math.floor((ms - part.start) / 140) % count) * 100) / (count - 1) +
          '% 0'
        : '0 0';
      animation.current = requestAnimationFrame(draw);
    }
    draw(start);
  }
  const { data: tomorrow } = useResource<Day>(
    '/api/duty/day?date=' + nextDate(selectedDate),
  );
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
  const label =
    displayText(day?.personName || '') ||
    (error ? '排班加载失败' : day ? '暂无值日安排' : '读取中…');
  return (
    <section className="card duty" data-duty-stage>
      <div className="card-heading">
        <h2>值日鸭鸭</h2>
        <span className="little-date">
          {selectedDate.slice(5).replace('-', ' / ')}
        </span>
      </div>
      <div className="stage-floor">
        <div
          className="patrol-track"
          ref={track}
          data-step={action?.name || 'idle'}
        >
          <motion.button
            ref={sprite}
            className="duty-sprite"
            data-action={action?.name || 'idle'}
            aria-label={'播放' + label + '的巡场动作'}
            disabled={!day?.duty || !prepared}
            onClick={patrol}
            style={{
              x,
              y,
              rotate: tilt,
              backgroundImage:
                'url(' +
                (action && loaded.current.has(role.actionSheets[action.name])
                  ? role.actionSheets[action.name]
                  : role.assetPath) +
                ')',
              backgroundSize:
                action && loaded.current.has(role.actionSheets[action.name])
                  ? role.actions[action.name].length * 100 + '% 100%'
                  : '100% 100%',
            }}
          />
        </div>
        <div>
          <strong>{label}</strong>
          <small>
            {day?.duty
              ? '周' +
                '一二三四五六日'[weekdayOf(selectedDate) - 1] +
                '值日负责人'
              : '排班状态'}
          </small>
        </div>
      </div>
      <p className="stage-caption" aria-live="polite">
        <Play size={13} />
        {action
          ? action.caption
          : message ||
            error ||
            (day?.duty ? '点击鸭鸭，看它巡场' : '当天暂无可展示的值日安排')}
      </p>
      <div className="stage-footer">
        <span>
          下班次 · {displayText(tomorrow?.personName || '') || '待排班'}
        </span>
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
          <button
            className="primary"
            disabled={!invite || busy}
            onClick={create}
          >
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
