import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Calendar from './pages/Calendar/Calendar';
import ReleaseAnnouncement from './pages/Calendar/ReleaseAnnouncement';
export default function RoutesComponent() { return <Routes><Route index element={<Calendar />} /><Route path="release-announcement" element={<ReleaseAnnouncement />} /></Routes>; }
