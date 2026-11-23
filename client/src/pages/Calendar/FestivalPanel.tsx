import React, { useState } from 'react';
import axios from 'axios';
import { Sun, Moon, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { festivals, type FestivalKey } from '../../../../shared/festivals';
import { explain } from '../../lib/client';
export type Preview = { key: FestivalKey; night: boolean };
export type ThemeRow = { key: FestivalKey; enabled: boolean };
export function FestivalPanel({
  open,
  close,
  preview,
  onPreview,
  rows,
  onSaved,
}: {
  open: boolean;
  close: () => void;
  preview: Preview | null;
  onPreview: (v: Preview | null) => void;
  rows: ThemeRow[];
  onSaved: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const current = preview?.key || 'spring',
    enabled = !!rows.find((r) => r.key === current)?.enabled;
  async function approve() {
    setBusy(true);
    try {
      await axios.post('/api/festivals', { key: current, enabled: !enabled, confirmed: true });
      onSaved();
      setConfirm(false);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  function pick(v: Preview) {
    onPreview(v);
    setConfirm(false);
    setError('');
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setConfirm(false);
          close();
        }
      }}
    >
      <DialogContent className="festival-panel">
        <DialogHeader>
          <DialogTitle>节日效果预览器</DialogTitle>
          <DialogDescription>选择主题和时段，关闭面板即可查看完整页面。</DialogDescription>
        </DialogHeader>
        <div className="theme-picks">
          {festivals.map((f) => (
            <button
              key={f.key}
              aria-pressed={preview?.key === f.key}
              onClick={() => pick({ key: f.key, night: preview?.night || false })}
            >
              <i style={{ background: f.color }} />
              {f.name}
              {rows.find((r) => r.key === f.key)?.enabled && <Check size={14} />}
            </button>
          ))}
        </div>
        <div className="button-row">
          <button
            aria-pressed={!!preview && !preview.night}
            onClick={() => pick({ key: current, night: false })}
          >
            <Sun size={16} />
            白天
          </button>
          <button aria-pressed={preview?.night} onClick={() => pick({ key: current, night: true })}>
            <Moon size={16} />
            夜晚
          </button>
        </div>
        <button
          className="primary"
          onClick={() => {
            if (!preview) pick({ key: current, night: false });
            close();
          }}
        >
          查看全页效果
        </button>
        {preview && (
          <button
            onClick={() => {
              onPreview(null);
              close();
            }}
          >
            结束预览
          </button>
        )}
        {confirm ? (
          <div role="group">
            <p>
              {enabled ? '停用' : '批准启用'}「{festivals.find((f) => f.key === current)?.name}
              」后将影响全员在节日期间看到的主题。
            </p>
            <button disabled={busy} onClick={approve}>
              确认{enabled ? '停用' : '批准启用'}
            </button>{' '}
            <button disabled={busy} onClick={() => setConfirm(false)}>
              取消
            </button>
          </div>
        ) : (
          <button
            className="text-link"
            disabled={!preview || !rows.some((r) => r.key === current)}
            onClick={() => setConfirm(true)}
          >
            {enabled ? '停用已批准主题' : '批准按节期启用'}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
