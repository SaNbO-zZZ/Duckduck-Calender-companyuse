import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { axiosForBackend } from '../../lib/client';
import { isAxiosError } from 'axios';
import { PersonSelect, PersonName } from '../../lib/client';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/ui/form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Calendar as DatePicker } from '../../components/ui/calendar';
import { zhCN } from 'date-fns/locale';
import { trackRegistration } from '../../../../shared/registration-progress';
import type {
  CalendarConfig,
  CalendarData,
  RegistrationKind,
  RegistrationRequest,
  RegistrationResult,
  RegistrationStatus,
  WeatherData,
} from '../../../../shared/api.interface';
const today = (ms = Date.now()) => new Date(ms + 480 * 60000).toISOString().slice(0, 10);
const dateLabel = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeText = (ms: number) =>
  new Date(ms + 480 * 60000).toISOString().slice(0, 16).replace('T', ' ') + '（北京时间）';
const apiMessage = (error: unknown) => {
  if (isAxiosError(error) && typeof error.response?.data?.error === 'string')
    return error.response.data.error;
  if (isAxiosError(error) && error.response) {
    const result = z
      .union([
        z.object({ message: z.union([z.string(), z.array(z.string())]) }),
        z.object({ error: z.object({ message: z.string() }) }),
      ])
      .safeParse(error.response.data);
    if (result.success) {
      const message = 'error' in result.data ? result.data.error.message : result.data.message;
      return Array.isArray(message) ? message.join('；') : message;
    }
  }
  return '网络请求未确认，请勿重复创建登记。可以核对本次登记结果。';
};
const schema = z.object({
  mentorId: z.string().min(1, '请选择你的 Mentor'),
  leaveType: z.enum(['年假', '调休', '出差', '事假', '病假', '今天不想上班']),
  startDate: z.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, '请选择开始时刻'),
  endDate: z.date(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, '请选择结束时刻'),
  arrivalDate: z.date(),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/, '请选择预计到达时刻'),
});
type Values = z.infer<typeof schema>;
export const title = { leave: '请假 / 出差知会', late: '天才总是晚到', early: '我先去拯救世界了' };
export function RegisterForm({
  kind,
  config,
  onDone,
  onClose,
  onBusy,
}: {
  kind: RegistrationKind;
  config: CalendarConfig;
  onDone: () => void;
  onClose: () => void;
  onBusy: (value: boolean) => void;
}) {
  const offset = useRef(config.serverTime - Date.now()),
    [now, setNow] = useState(Date.now() + offset.current),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<RegistrationResult | null>(null),
    [error, setError] = useState(''),
    key = useRef(crypto.randomUUID()),
    snapshot = useRef<RegistrationRequest | null>(null);
  const progressAbort = useRef<AbortController | null>(null),
    observedRecord = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      progressAbort.current?.abort();
    };
  }, []);
  const defaultDay = today(now),
    defaultDate = new Date(defaultDay + 'T12:00:00'),
    arrival = new Date(
      Math.min(
        Date.parse(defaultDay + 'T23:59:00+08:00'),
        Math.max(now + 30 * 60000, Date.parse(defaultDay + 'T10:01:00+08:00')),
      ) +
        480 * 60000,
    )
      .toISOString()
      .slice(11, 16);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      mentorId: '',
      leaveType: '年假',
      startDate: defaultDate,
      startTime: '10:00',
      endDate: defaultDate,
      endTime: '18:00',
      arrivalDate: defaultDate,
      arrivalTime: arrival,
    },
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(timer);
  }, []);
  const submit = async (data: Values) => {
    if (busy || (result && !result.processing)) return;
    if (!snapshot.current) {
      const request: RegistrationRequest = {
        requestKey: key.current,
        kind,
        mentorId: data.mentorId,
        leaveType: kind === 'leave' ? data.leaveType : '',
        start: kind === 'leave' ? dateLabel(data.startDate) + 'T' + data.startTime : '',
        end: kind === 'leave' ? dateLabel(data.endDate) + 'T' + data.endTime : '',
        arrivalTime: kind === 'late' ? data.arrivalTime : '',
        ...(kind === 'late' ? { arrivalDate: dateLabel(data.arrivalDate) } : {}),
      };
      if (kind === 'leave' && request.end <= request.start) {
        form.setError('endTime', { message: '结束时间须晚于开始时间。' });
        return;
      }
      if (
        kind === 'late' &&
        (Date.parse(dateLabel(data.arrivalDate) + 'T' + data.arrivalTime + ':00+08:00') <= now ||
          data.arrivalTime <= '10:00')
      ) {
        form.setError('arrivalTime', { message: '预计到达须晚于所选日期 10:00，且尚未到达该时刻。' });
        return;
      }
      snapshot.current = request;
    }
    setBusy(true);
    onBusy(true);
    setError('');
    const controller = new AbortController();
    progressAbort.current = controller;
    const showProgress = (r: RegistrationResult) => {
      if (!mounted.current) return;
      setResult(r);
      if (r.recorded) {
        onBusy(false);
        if (!observedRecord.current) {
          observedRecord.current = true;
          onDone();
        }
      }
    };
    try {
      await trackRegistration({
        submit: () =>
          axiosForBackend<RegistrationResult>({
            url: '/api/calendar/register',
            method: 'POST',
            data: snapshot.current,
            timeout: 120000,
          }).then((r) => r.data),
        read: () =>
          axiosForBackend<RegistrationStatus>({
            url: '/api/calendar/registration-status',
            method: 'GET',
            params: { requestKey: key.current },
            timeout: 5000,
            signal: controller.signal,
          }).then((r) => r.data.result),
        onProgress: showProgress,
        signal: controller.signal,
      });
    } catch (e) {
      if (mounted.current) {
        setError(apiMessage(e));
        if (isAxiosError(e) && e.response && e.response.status < 500) {
          snapshot.current = null;
          setResult(null);
        }
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  const dateField = (name: 'startDate' | 'endDate' | 'arrivalDate', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex-1 min-w-0">
          <FormLabel>{label}日期</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button type="button" variant="outline" className="w-full justify-start rounded-2xl">
                  {dateLabel(field.value)}
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DatePicker
                mode="single"
                locale={zhCN}
                defaultMonth={field.value}
                selected={field.value}
                onSelect={(d) => d && field.onChange(d)}
              />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  const timeField = (name: 'startTime' | 'endTime' | 'arrivalTime', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex-1 min-w-0">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="time" className="rounded-2xl" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
        <fieldset disabled={busy || !!snapshot.current || !!result} className="space-y-5 min-w-0">
          {kind === 'leave' ? (
            <>
              <FormField
                control={form.control}
                name="leaveType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      类型
                      <span aria-hidden="true" className="text-red-500">
                        {' '}
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="不在岗类型">
                        {(['年假', '调休', '出差', '事假', '病假', '今天不想上班'] as const).map(
                          (name, i) => (
                            <Button
                              type="button"
                              key={name}
                              role="radio"
                              aria-checked={field.value === name}
                              onClick={() => field.onChange(name)}
                              className={
                                'rounded-full ' +
                                (field.value === name
                                  ? 'bg-[#ff7957] text-white hover:bg-[#f66d4b]'
                                  : 'bg-[#f5f3f0] text-[#38332e] hover:bg-[#eee9e3]')
                              }
                            >
                              {['🌴', '🗓', '🧳', '📝', '🤒', '📌'][i]} {name}
                            </Button>
                          ),
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-3">
                {dateField('startDate', '开始')}
                {timeField('startTime', '开始时刻')}
              </div>
              <div className="flex gap-3">
                {dateField('endDate', '结束')}
                {timeField('endTime', '结束时刻')}
              </div>
            </>
          ) : kind === 'late' ? (
            <>
              {dateField('arrivalDate', '到达')}
              {timeField('arrivalTime', '预计到达时间')}
              <p className="text-sm text-[#8d8074]">
                按北京时间登记。请选择所选日期 10:00 之后、尚未到达的时刻。
              </p>
            </>
          ) : (
            <div>
              <p className="mb-2 font-medium">当前时间</p>
              <p className="rounded-2xl bg-[#f6f4f1] p-3 text-sm" role="timer">
                {timeText(now)}
              </p>
            </div>
          )}
          <FormField
            control={form.control}
            name="mentorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  @你的 Mentor
                  <span aria-hidden="true" className="text-red-500">
                    {' '}
                    *
                  </span>
                </FormLabel>
                <FormControl>
                  <PersonSelect value={field.value} onChange={field.onChange} label="选择 Mentor" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div>
            <p className="mb-2 font-medium">人事</p>
            <div className="rounded-2xl bg-[#f6f4f1] p-3">
              <PersonName id={config.hrUserId} />
            </div>
            <p className="mt-2 text-xs text-[#8d8074]">后台固定人事 · 仅通知，无审批</p>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="rounded-2xl bg-[#f4f4ed] p-3 text-sm">
            {result.message}
            <br />
            <span className="break-all text-xs text-[#8d8074]">登记编号：{key.current}</span>
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy && !result?.recorded}
            className="rounded-full"
          >
            {result?.recorded ? (result.processing ? '关闭' : '完成') : '取消'}
          </Button>
          {(!result || result.processing) && (
            <Button
              type="submit"
              disabled={busy}
              className="rounded-full bg-gradient-to-r from-[#ff7952] to-[#ff5186] text-white"
            >
              {busy
                ? result?.recorded
                  ? '正在发送通知…'
                  : '正在保存登记…'
                : snapshot.current
                  ? '核对本次登记结果'
                  : '登记并通知'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
