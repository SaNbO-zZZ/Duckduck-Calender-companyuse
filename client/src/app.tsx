import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Calendar from './pages/Calendar/Calendar';
export default function RoutesComponent() { return <Routes><Route index element={<Calendar />} /></Routes>; }
