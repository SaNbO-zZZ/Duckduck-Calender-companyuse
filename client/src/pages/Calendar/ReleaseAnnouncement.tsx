import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { isAxiosError } from 'axios';

type Preview = {recipientCount: number; wikiUrl: string};
type Result = {version: string; expected: number; accepted: number; needsReview: number; message: string; wikiUrl: string};
const wikiUrl = 'https://ycn3zdw6f1p7.feishu.cn/wiki/I6uzwNwd7izfPCkQHJDcoxdRnRb';
const explain = (error: unknown) => isAxiosError(error)
  ? String(error.response?.data?.message || error.message)
  : '请求未确认，请先核对该版本的发送状态，不要重复提交。';

export default function ReleaseAnnouncement() {
  const [version, setVersion] = useState('v3.2.1');
  const [lines, setLines] = useState('首页空状态换上团队新文案：Alpha Pulse 一定会更大更强、一切安好～\n新增版本更新私聊知会，更新摘要和完整日志一键可达');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const highlights = lines.split('\n').map(line => line.trim()).filter(Boolean);
  const canSend = !!preview && !busy && /^v\d+\.\d+\.\d+$/.test(version) && highlights.length >= 1 && highlights.length <= 5;

  const loadPreview = async () => {
    setBusy(true); setError(''); setPreview(null); setResult(null);
    try {
      const response = await axiosForBackend<Preview>({url: '/api/calendar/release-announcement/preview', method: 'GET', timeout: 30000});
      setPreview(response.data);
    } catch (reason) { setError(explain(reason)); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!canSend) return;
    setBusy(true); setError('');
    try {
      const response = await axiosForBackend<Result>({url: '/api/calendar/release-announcement/publish', method: 'POST',
        data: {version, highlights}, timeout: 120000});
      setResult(response.data);
    } catch (reason) { setError(explain(reason)); }
    finally { setBusy(false); }
  };
  const checkStatus = async () => {
    if (!/^v\d+\.\d+\.\d+$/.test(version)) return;
    setBusy(true); setError('');
    try {
      const response = await axiosForBackend<Result>({url: '/api/calendar/release-announcement/status', method: 'GET', params: {version}});
      setResult(response.data);
    } catch (reason) { setError(explain(reason)); }
    finally { setBusy(false); }
  };

  return <main className="min-h-dvh bg-[#f4f6fa] px-4 py-8 text-[#27303d]">
    <section className="mx-auto max-w-2xl rounded-3xl border border-white bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-9">
      <NavLink className="text-sm text-blue-600 hover:underline" to="/">← 返回鸭鸭日历</NavLink>
      <h1 className="mt-6 text-3xl font-bold">版本更新知会</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">仅版本通知管理员可发送。请先发布应用并写好更新日志，再向公司内部员工私聊发送一次。</p>
      <label className="mt-8 block text-sm font-semibold" htmlFor="release-version">版本号</label>
      <input id="release-version" value={version} onChange={event => {setVersion(event.target.value); setPreview(null); setResult(null);}} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-400" placeholder="v3.2.1" />
      <label className="mt-6 block text-sm font-semibold" htmlFor="release-notes">本次更新亮点（每行一条，最多五条）</label>
      <textarea id="release-notes" value={lines} onChange={event => {setLines(event.target.value); setPreview(null); setResult(null);}} rows={5} className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 leading-7 outline-none focus:border-blue-400" />
      <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">消息预览｜鸭鸭日历发布新版本-更新说明</p>
        <p className="mt-2">{version} 更新上线啦</p>
        <ul className="mt-2 list-disc pl-5">{highlights.map((line, index) => <li key={index}>{line}</li>)}</ul>
        <a className="mt-2 inline-block text-blue-600 underline" href={wikiUrl} target="_blank" rel="noreferrer">查看完整更新说明</a>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={loadPreview} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">核对全员名单</button>
        <button type="button" disabled={busy} onClick={checkStatus} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">核对发送结果</button>
      </div>
      {preview && <p className="mt-5 text-sm">已核对 <strong>{preview.recipientCount}</strong> 位公司内部员工。文档链接：<a className="text-blue-600 underline" href={preview.wikiUrl}>更新日志</a></p>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {result && <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{result.message} {result.accepted}/{result.expected} 个请求获平台受理；{result.needsReview} 个需核对。</p>}
      <button type="button" disabled={!canSend} onClick={publish} className="mt-8 w-full rounded-full bg-gradient-to-r from-[#ff7a56] to-[#fb4f7d] px-5 py-3 font-bold text-white shadow-lg shadow-rose-200 disabled:cursor-not-allowed disabled:opacity-40">{busy ? '处理中…' : '发布版本更新知会'}</button>
      <p className="mt-3 text-xs leading-5 text-slate-400">同一版本只建一次批次；平台受理不等于员工已读。请求状态不明时先核对，避免重复通知。</p>
    </section>
  </main>;
}