import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import axios from 'axios';
import RoutesComponent from './app';
import { Directory, Session, type Person, type User } from './lib/client';
import './index.css';
import './pages/Calendar/calendar.css';
function App() {
  const [user, setUser] = useState<User | null>(null),
    [people, setPeople] = useState<Person[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const me = await axios.get('/api/auth/me', { signal: ac.signal });
      if (!me.data?.user?.open_id) throw Error();
      setUser(me.data.user);
      const { data } = await axios.get<Person[]>('/api/calendar/people', { signal: ac.signal });
      setPeople(data);
    })().catch((e) => {
      if (ac.signal.aborted) return;
      if (e.response?.status === 401) {
        location.replace(
          '/api/auth/feishu/login?' +
            new URLSearchParams({ returnTo: location.pathname + location.search + location.hash }),
        );
        return;
      }
      setError('暂时无法读取账号资料，请刷新重试。');
    });
    return () => ac.abort();
  }, []);
  if (error || !user)
    return (
      <main className="loading-page" role="status">
        {error || '正在打开鸭鸭日历…'}
      </main>
    );
  return (
    <Session.Provider value={user}>
      <Directory.Provider value={people}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <RoutesComponent />
          </BrowserRouter>
        </MotionConfig>
      </Directory.Provider>
    </Session.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
