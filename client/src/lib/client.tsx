import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
export const axiosForBackend = axios;
export interface Person {
  id: string;
  name: string;
  avatar?: string;
}
export interface User {
  open_id: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'member';
}
export const Session = createContext<User | null>(null);
export const Directory = createContext<Person[]>([]);
export function useUser() {
  return useContext(Session)!;
}
export function PersonName({ id }: { id: string }) {
  return <>{useContext(Directory).find((p) => p.id === id)?.name || '账号资料待同步'}</>;
}
export function PersonSelect({
  value,
  onChange,
  label,
  exclude,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  exclude?: string;
}) {
  const people = useContext(Directory);
  return (
    <select
      aria-label={label}
      className="person-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
    >
      <option value="">{label}</option>
      {people
        .filter((p) => p.id !== exclude)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}
export function useResource<T>(url: string, revision = 0) {
  const [result, set] = useState<{ url: string; data?: T; error?: string }>({ url: '' });
  useEffect(() => {
    const ac = new AbortController();
    axios
      .get<T>(url, { signal: ac.signal })
      .then((r) => set({ url, data: r.data }))
      .catch((e) => {
        if (!ac.signal.aborted) set({ url, error: explain(e) });
      });
    return () => ac.abort();
  }, [url, revision]);
  return result.url === url ? result : { url };
}
export const explain = (e: unknown) =>
  axios.isAxiosError(e)
    ? String(e.response?.data?.error || '网络连接失败，请重试。')
    : '操作未完成，请重试。';
export function burst() {
  window.dispatchEvent(new Event('duck-celebrate'));
}
