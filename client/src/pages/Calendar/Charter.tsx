import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import axios from 'axios';
import { ArrowLeft, BookOpen, Check, Pin, RefreshCw, Search } from 'lucide-react';
import { burst, explain, useResource, useUser } from '../../lib/client';
import { Particles } from './scene/Particles';
type Chapter = {
  slug: string;
  title: string;
  category: string;
  markdown_content: string;
  summary: string;
  version: string;
  duck_sticker_id: string;
  is_pinned: boolean;
};
type Handbook = { docs: Chapter[]; version: string; read: number; total: number; acknowledged: boolean };
type Timing = { id: string; seq: number[]; dur: number[] };
let timing: Promise<Timing[]> | undefined;
export function OriginalDuckSprite({ id, size = 64 }: { id: string; size?: number }) {
  const [frame, setFrame] = useState(0),
    ref = useRef<HTMLSpanElement>(null),
    reduce = useReducedMotion();
  useEffect(() => {
    setFrame(0);
    if (reduce) return;
    let active = true,
      timer: number,
      observer: IntersectionObserver;
    timing ??= axios
      .get<Timing[]>('/assets/duck-original-24/design-manifest.json')
      .then((r) => r.data)
      .catch((e) => {
        timing = undefined;
        throw e;
      });
    timing
      .then((rows) => {
        const spec = rows.find((r) => r.id === id);
        if (!active || !spec) return;
        const play = (i: number) => {
          if (!active) return;
          setFrame(spec.seq[i]);
          if (i + 1 < spec.seq.length) timer = window.setTimeout(() => play(i + 1), spec.dur[i]);
        };
        observer = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer.disconnect();
            play(0);
          }
        });
        observer.observe(ref.current);
      })
      .catch(() => {});
    return () => {
      active = false;
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [id, reduce]);
  return (
    <span
      ref={ref}
      role="img"
      aria-label="原创动态鸭"
      className="original-duck"
      style={{
        width: size,
        height: size,
        backgroundImage: 'url(/assets/duck-original-24/' + id + '/sheet-transparent.png)',
        backgroundPosition: (frame % 2) * 100 + '% ' + Math.floor(frame / 2) * 100 + '%',
      }}
    />
  );
}
export default function Charter() {
  const user = useUser(),
    [rev, refresh] = useState(0),
    { data, error } = useResource<Handbook>('/api/charter', rev);
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('全部'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [justRead, setRead] = useState(''),
    reduce = useReducedMotion();
  const docs = (data?.docs || []).map((c) => (c.category === '章节' ? { ...c, category: c.title } : c)),
    matches = docs.filter(
      (c) =>
        (category === '全部' || c.category === category) &&
        (c.title + c.markdown_content).toLowerCase().includes(search.trim().toLowerCase()),
    );
  async function action(name: string, body: object = {}) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await axios.post('/api/charter?action=' + name, body);
      if (name === 'ack') {
        setRead(data.version);
        burst();
      } else setMessage(name === 'sync' ? '已与飞书原文同步。' : '章节设置已保存。');
      refresh((r) => r + 1);
    } catch (e) {
      setMessage(explain(e));
    } finally {
      setBusy(false);
    }
  }
  const ack = !!data?.version && (data.acknowledged || justRead === data.version);
  return (
    <main className="handbook">
      <Particles night={false} />
      <div className="book-shell">
        <header className="book-nav">
          <Link to="/">
            <ArrowLeft size={16} />
            返回日历
          </Link>
          {user.role === 'admin' && (
            <button disabled={busy} onClick={() => action('sync')}>
              <RefreshCw size={15} />
              从飞书文档同步
            </button>
          )}
        </header>
        <section className="book-cover">
          <div>
            <span className="section-label">
              <BookOpen size={16} />
              团队手册
            </span>
            <h1>鸭鸭公约</h1>
            <p>{data?.version ? '飞书修订 ' + Number(data.version.slice(1)) : '公约同步中'}</p>
          </div>
          <OriginalDuckSprite id="01" size={110} />
          <div className="read-progress">
            <span>全员阅读进度</span>
            <strong>
              {data?.read ?? 0} / {data?.total ?? 0}
            </strong>
            <progress value={data?.read || 0} max={data?.total || 1} />
          </div>
        </section>
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert">
            {error} <button onClick={() => refresh((r) => r + 1)}>重试</button>
          </p>
        )}
        <div className="book-layout">
          <aside className="card contents">
            <h2>章节目录</h2>
            {matches.map((c, i) => (
              <a key={c.slug} href={'#' + c.slug}>
                {String(i + 1).padStart(2, '0')} {c.title}
              </a>
            ))}
          </aside>
          <section>
            <label className="book-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索公约条款"
                aria-label="搜索公约条款"
              />
            </label>
            <div className="filters">
              {['全部', ...new Set(docs.map((c) => c.category))].map((v) => (
                <button key={v} aria-pressed={category === v} onClick={() => setCategory(v)}>
                  {v}
                </button>
              ))}
            </div>
            {matches.map((c, i) => (
              <motion.article
                id={c.slug}
                key={c.slug}
                className="chapter card"
                initial={{ opacity: 0, y: reduce ? 0 : 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i, 3) * 0.06 }}
              >
                <div className="chapter-heading">
                  <div>
                    <span>{c.category}</span>
                    <h2>{c.title}</h2>
                  </div>
                  <OriginalDuckSprite id={c.duck_sticker_id || '01'} />
                </div>
                {c.is_pinned && (
                  <div className="highlight">
                    <Pin size={15} />
                    鸭鸭划重点
                  </div>
                )}
                <Markdown remarkPlugins={[gfm]}>{c.markdown_content}</Markdown>
                {user.role === 'admin' && (
                  <details>
                    <summary>章节设置</summary>
                    <label>
                      配图{' '}
                      <select
                        value={c.duck_sticker_id}
                        disabled={busy}
                        onChange={(e) =>
                          action('edit', {
                            slug: c.slug,
                            duck_sticker_id: e.target.value,
                            is_pinned: c.is_pinned,
                          })
                        }
                      >
                        {Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0')).map(
                          (id) => (
                            <option key={id}>{id}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={c.is_pinned}
                        disabled={busy}
                        onChange={(e) =>
                          action('edit', {
                            slug: c.slug,
                            duck_sticker_id: c.duck_sticker_id,
                            is_pinned: e.target.checked,
                          })
                        }
                      />{' '}
                      标为重点条款
                    </label>
                  </details>
                )}
              </motion.article>
            ))}
            {data && !matches.length && <p>{docs.length ? '没有匹配条款。' : '暂无已同步的章节。'}</p>}
            {data?.version && (
              <section className="card read-card">
                {ack ? (
                  <motion.strong
                    className="stamp"
                    initial={justRead === data.version && !reduce ? { scale: 2.2, rotate: -18 } : false}
                    animate={{ scale: 1, rotate: -6 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  >
                    鸭鸭已阅
                  </motion.strong>
                ) : (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => action('ack', { version: data.version })}
                  >
                    <Check size={18} />
                    我已认真读完并同意
                  </button>
                )}
              </section>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
