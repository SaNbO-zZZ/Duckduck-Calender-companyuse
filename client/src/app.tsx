import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Calendar from './pages/Calendar/Calendar';
import ReleaseAnnouncement from './pages/Calendar/ReleaseAnnouncement';
import DutyExchangePage from './pages/Calendar/DutyExchangePage';
export default function RoutesComponent() { return <Routes><Route index element={<Calendar />} /><Route path="release-announcement" element={<ReleaseAnnouncement />} /><Route path="duty-exchange" element={<DutyExchangePage />} /></Routes>; }
