import React, { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Calendar from './pages/Calendar/Calendar';
const Charter = lazy(() => import('./pages/Calendar/Charter'));
const DutyExchange = lazy(() => import('./pages/Calendar/DutyExchangePage'));
const Release = lazy(() => import('./pages/Calendar/ReleaseAnnouncement'));
export default function RoutesComponent() {
  return (
    <Suspense
      fallback={
        <p className="loading-page" role="status">
          正在加载页面…
        </p>
      }
    >
      <Routes>
        <Route index element={<Calendar />} />
        <Route path="charter" element={<Charter />} />
        <Route path="duty-exchange" element={<DutyExchange />} />
        <Route path="release-announcement" element={<Release />} />
        <Route
          path="*"
          element={
            <main className="loading-page">
              <h1>找不到此页面</h1>
              <Link to="/">返回日历</Link>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}
