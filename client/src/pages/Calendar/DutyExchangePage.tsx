import { displayText } from '../../lib/display-text';
import {Particles} from './scene/Particles';
import React, { useEffect, useState } from 'react';
import { burst } from '../../lib/client';
import { Link,useSearchParams } from 'react-router-dom';
import { axiosForBackend } from '../../lib/client';

type ExchangeView = {
  requestId: string;
  dutyDate: string;
  state: 'draft' | 'awaiting_confirmation' | 'confirmed' | 'applied' | 'rejected' | 'cancelled' | 'expired';
  expiresAt: string;
  initiatorName: string;
  inviteeName: string;
  originalPersonName: string;
  replacementPersonName: string;
  viewerRole: 'initiator' | 'invitee' | 'observer';
  message: string;
};

const stateCopy: Record<ExchangeView['state'], string> = {
  draft: '草稿', awaiting_confirmation: '等伙伴确认接班', confirmed: '已确认，正在更新排班', applied: '已生效', rejected: '已拒绝', cancelled: '已取消', expired: '已过期',
};

export default function DutyExchangePage() {
  const [params] = useSearchParams();
  const requestId = params.get('requestId') || '';
  const [view, setView] = useState<ExchangeView | null>(null);
  const [message, setMessage] = useState('正在读取换班请求…');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!requestId) { setMessage('换班链接不完整，请从原邀请重新打开。'); return; }
    try {
      const response = await axiosForBackend<ExchangeView>({ url: `/api/duty/exchange-requests/${encodeURIComponent(requestId)}`, method: 'GET', timeout: 12000 });
      setView(response.data);
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '换班请求读取失败，请返回重试。');
    }
  };
  useEffect(() => { void load(); }, [requestId]);

  const decide = async (decision: 'confirm' | 'reject' | 'cancel') => {
    if (!requestId || busy) return;
    setBusy(true);
    try {
      const response = await axiosForBackend<ExchangeView>({ url: `/api/duty/exchange-requests/${encodeURIComponent(requestId)}/decision`, method: 'POST', data: { decision }, timeout: 12000 });
      if(response.data.state==='applied')burst();
      setView(response.data);
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '换班状态更新失败，请稍后重试。');
    } finally { setBusy(false); }
  };

  const awaiting = view?.state === 'awaiting_confirmation';
  return <main className="min-h-screen bg-[#f7f5ef] px-4 py-10 text-slate-800 sm:px-8">
    <Particles night={false}/><Link className="back-link" to="/">返回日历</Link><section className="mx-auto max-w-xl rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-xl backdrop-blur">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-[#9b621c]">值日鸭鸭 · 换班邀请</p>
      <h1 className="mt-3 text-2xl font-semibold">一起看一下这次换班</h1>
      {view ? <>
        <div className="mt-5 rounded-2xl bg-[#fff8e9] p-4 text-sm leading-7">
          <p className="m-0"><b>值日日期：</b>{view.dutyDate}</p>
          <p className="m-0"><b>发起人：</b>{displayText(view.initiatorName || '')}</p>
          <p className="m-0"><b>被邀请人：</b>{displayText(view.inviteeName || '')}</p>
          <p className="m-0"><b>换班后负责人：</b>{displayText(view.replacementPersonName || '')}</p>
          <p className="m-0"><b>当前状态：</b>{stateCopy[view.state]}</p>
          {awaiting && <p className="m-0 text-xs text-slate-500">确认截止：{new Date(view.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>}
        </div>
        {awaiting && view.viewerRole === 'invitee' && <div className="mt-5 flex gap-3"><button type="button" disabled={busy} onClick={() => void decide('confirm')} className="flex-1 rounded-xl bg-[#e88b38] px-4 py-3 font-semibold text-white disabled:opacity-50">确认接班</button><button type="button" disabled={busy} onClick={() => void decide('reject')} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">这次不方便</button></div>}
        {awaiting && view.viewerRole === 'initiator' && <button type="button" disabled={busy} onClick={() => void decide('cancel')} className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">取消换班请求</button>}
      </> : <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">{message}</div>}
      <p className="mt-5 text-xs leading-5 text-slate-500">{message}</p>
    </section>
  </main>;
}
