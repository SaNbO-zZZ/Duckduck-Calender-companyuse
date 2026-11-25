import { scatter } from './scene/InteractionDust';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Cake, CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type {
  CalendarData,
  CalendarEvent,
} from '../../../../shared/api.interface';
import {
  addBeijingDays,
  parseBeijingDate,
  weekdayOf,
} from '../../../../shared/duty-calendar';
import { calendarLabels } from '../../../../shared/lunar-festivals';
import { displayText } from '../../lib/display-text';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';

const weekdays = '一二三四五六日';
const types = { late: '晚到', early: '提前离开', leave: '请假 / 出差' };
function eventKind(type: string) {
  if (type === '晚到' || type === '迟到') return 'late';
  if (type === '提前离开' || type === '早退') return 'early';
  return 'leave';
}
function monthDays(month: string, data?: CalendarData) {
  const start = month + '-01';
  const first = addBeijingDays(start, 1 - weekdayOf(start));
  return Array.from({ length: 42 }, (_, i) => {
    const date = addBeijingDays(first, i),
      from = parseBeijingDate(date);
    const labels = calendarLabels(date);
    const birthdays = data?.birthdays?.filter((b) => b.date === date) || [];
    const holidays = data?.holidays?.filter((h) => h.date === date) || [];
    const official = holidays
      .map((h) => {
        const flag = /班/.test(h.type)
          ? '班'
          : /休|假/.test(h.type)
            ? '休'
            : displayText(h.type);
        return [flag, displayText(h.name)].filter(Boolean).join('·');
      })
      .join('、');
    const events =
      data?.events.filter((e) => e.start < from + 86400000 && e.end > from) ||
      [];
    const sub = birthdays.length
      ? '生日'
      : official || labels.festival || labels.term || labels.lunar;
    return {
      date,
      labels,
      official,
      birthdays,
      sub,
      events,
      kinds: [...new Set(events.map((e) => eventKind(e.type)))],
    };
  });
}
type Day = ReturnType<typeof monthDays>[number];
const shortTime = (ms: number) =>
  new Date(ms + 28800000).toISOString().slice(11, 16);
function noticeTime(event: CalendarEvent, date: string) {
  const from = parseBeijingDate(date);
  if (eventKind(event.type) === 'late')
    return '预计 ' + shortTime(event.end) + ' 到';
  if (eventKind(event.type) === 'early')
    return shortTime(event.start) + ' 离开';
  return (
    (event.start <= from ? '00:00' : shortTime(event.start)) +
    ' – ' +
    (event.end >= from + 86400000 ? '24:00' : shortTime(event.end))
  );
}
function Details({
  day,
  person,
  pending,
  error,
  retry,
}: {
  day: Day;
  person: (id: string) => string;
  pending: boolean;
  error?: string;
  retry: () => void;
}) {
  const { lunar, festival, term } = day.labels;
  return (
    <>
      <p className="date-meta">
        {[
          ...new Set(
            [day.official, festival, term, '农历' + lunar].filter(Boolean),
          ),
        ].join(' · ')}
      </p>
      {day.birthdays.length > 0 && (
        <div className="birthday-wish">
          <Cake size={18} />
          <div>
            <strong>生日快乐</strong>
            <p>
              {day.birthdays
                .map((b) => displayText(b.name) || '团队成员')
                .join('、')}
              ，愿今天的小事都合心意。
            </p>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert">
          {error} <button onClick={retry}>重试</button>
        </p>
      ) : pending ? (
        <p role="status">正在读取这一天的知会…</p>
      ) : !day.events.length ? (
        <p className="day-empty">这一天还没有知会。</p>
      ) : (
        (Object.keys(types) as Array<keyof typeof types>).map((kind) => {
          const events = day.events.filter((e) => eventKind(e.type) === kind);
          return (
            events.length > 0 && (
              <section key={kind} className="detail-group">
                <h3>
                  <i data-dot={kind} />
                  {types[kind]}
                </h3>
                {events.map((e) => (
                  <p key={e.id}>
                    <strong>{e.userIds.map(person).join('、')}</strong>
                    <span>
                      {kind === 'leave' && displayText(e.type) + ' · '}
                      {noticeTime(e, day.date)}
                    </span>
                  </p>
                ))}
              </section>
            )
          );
        })
      )}
    </>
  );
}

export function MonthCard({
  month,
  date,
  today,
  data,
  error,
  select,
  move,
  retry,
  mobile,
  night,
}: {
  month: string;
  date: string;
  today: string;
  data?: CalendarData;
  error?: string;
  select: (date: string) => void;
  move: (delta: number) => void;
  retry: () => void;
  mobile: boolean;
  night: boolean;
}) {
  const [opened, setOpened] = useState('');
  const [side, setSide] = useState<'top' | 'bottom' | 'left' | 'right'>(
    'right',
  );
  const grid = useRef<HTMLDivElement>(null);
  const cells = useMemo(() => monthDays(month, data), [month, data]);
  const reduce = useReducedMotion();
  const selected = cells.find((d) => d.date === opened);
  const celebrated = useRef('');
  const hasBirthday = !!selected?.birthdays.length;
  useEffect(() => {
    if (!opened || !hasBirthday) return;
    const frame = requestAnimationFrame(() =>
      scatter('birthday', document.querySelector('.day-sheet,.day-pop')),
    );
    return () => cancelAnimationFrame(frame);
  }, [opened, hasBirthday]);
  useEffect(() => {
    if (
      celebrated.current === today ||
      opened ||
      !data?.birthdays?.some((b) => b.date === today)
    )
      return;
    const cell = grid.current?.querySelector('[aria-label="' + today + '"]');
    if (cell) {
      const frame = requestAnimationFrame(() => {
        celebrated.current = today;
        scatter('birthday', cell);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [today, data, opened]);
  const person = (id: string) =>
    displayText(data?.people.find((p) => p.id === id)?.name || '') ||
    '团队成员';
  const content = selected && (
    <Details
      day={selected}
      person={person}
      pending={!data}
      error={error}
      retry={retry}
    />
  );
  const heading =
    selected &&
    Number(opened.slice(5, 7)) +
      ' 月 ' +
      Number(opened.slice(8)) +
      ' 日 · 星期' +
      weekdays[weekdayOf(opened) - 1];
  const close = () => setOpened('');
  useEffect(() => {
    close();
  }, [mobile]);

  function openDate(day: Day, anchor: HTMLButtonElement) {
    if (mobile) setOpened(day.date);
    else if (grid.current) {
      const cell = anchor.getBoundingClientRect(),
        boundary = grid.current.getBoundingClientRect();
      const above = cell.top - Math.max(0, boundary.top);
      const below = Math.min(innerHeight, boundary.bottom) - cell.bottom;
      const left = cell.left - boundary.left,
        right = boundary.right - cell.right;
      // Fit the longer axis first for dense days; Radix rechecks actual dimensions on scroll/resize.
      const contentHeight =
        100 + day.events.length * 46 + (day.birthdays.length ? 86 : 0);
      if (
        Math.max(above, below) >= contentHeight &&
        Math.min(left, right) > 115
      )
        setSide(below >= above ? 'bottom' : 'top');
      else setSide(right >= left ? 'right' : 'left');
    }
    select(day.date);
  }

  return (
    <section className="card calendar-month">
      <div className="month-heading">
        <div className="month-title">
          <CalendarDays size={18} />
          <h1>{Number(month.slice(5))}月</h1>
          <span>{month.slice(0, 4)}</span>
        </div>
        <div className="month-controls">
          <button
            aria-label="上个月"
            onClick={() => {
              close();
              move(-1);
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => {
              close();
              select(today);
            }}
          >
            今天
          </button>
          <button
            aria-label="下个月"
            onClick={() => {
              close();
              move(1);
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="weekday-band">
        {[...weekdays].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <motion.div
        className="date-grid"
        key={month}
        ref={grid}
        initial={reduce ? false : { opacity: 0.8, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        {cells.map((day) => {
          const d = day.date;
          const button = (
            <button
              type="button"
              aria-label={d}
              aria-describedby={'label-' + d}
              aria-current={d === today ? 'date' : undefined}
              aria-pressed={d === date}
              className="date-cell"
              data-outside={!d.startsWith(month)}
              data-birthday={!!day.birthdays.length}
              onClick={(e) => openDate(day, e.currentTarget)}
            >
              {d === date && (
                <motion.span
                  aria-hidden
                  className="selection-edge"
                  layoutId="selected-date-edge"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 310, damping: 26 }
                  }
                />
              )}
              <b>{Number(d.slice(8))}</b>
              <span className="cell-caption" id={'label-' + d}>
                {day.birthdays.length > 0 && <Cake size={12} />}
                <span>{day.sub}</span>
              </span>
              <span className="event-dots" aria-hidden>
                {day.kinds.map((k) => (
                  <i data-dot={k} key={k} />
                ))}
              </span>
            </button>
          );
          if (mobile) return <React.Fragment key={d}>{button}</React.Fragment>;
          return (
            <Popover
              key={d}
              open={opened === d}
              onOpenChange={(v) =>
                setOpened((current) => (v ? d : current === d ? '' : current))
              }
            >
              <PopoverTrigger asChild>{button}</PopoverTrigger>
              {opened === d && (
                <PopoverContent
                  aria-label={heading}
                  className="day-pop calendar-glass"
                  data-night={night}
                  collisionBoundary={grid.current}
                  collisionPadding={5}
                  sideOffset={6}
                  side={side}
                  align="center"
                  hideWhenDetached
                >
                  <div className="detail-head">
                    <h2>{heading}</h2>
                    <button aria-label="关闭日期详情" onClick={close}>
                      <X size={17} />
                    </button>
                  </div>
                  <motion.div
                    initial={reduce ? false : { opacity: 0.75, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 310, damping: 26 }}
                  >
                    {content}
                  </motion.div>
                </PopoverContent>
              )}
            </Popover>
          );
        })}
      </motion.div>
      <div className="calendar-key">
        {Object.entries(types).map(([k, name]) => (
          <span key={k}>
            <i data-dot={k} />
            {name}
          </span>
        ))}
      </div>
      {mobile && (
        <Dialog
          open={!!selected}
          onOpenChange={(v) => {
            if (!v) close();
          }}
        >
          <DialogContent
            placement="bottom"
            className="day-sheet calendar-glass"
            data-night={night}
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              grid.current
                ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
                ?.focus({ preventScroll: true });
            }}
          >
            <DialogTitle>{heading}</DialogTitle>
            <div className="sheet-scroll">{content}</div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
