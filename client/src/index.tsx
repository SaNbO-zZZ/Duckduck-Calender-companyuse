import React from 'react';
import axios from 'axios';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import { AppContainer } from '@lark-apaas/client-toolkit/components/AppContainer';
import { ErrorRender } from '@lark-apaas/client-toolkit/components/ErrorRender';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';

const CLIENT_BASE_PATH = process.env.CLIENT_BASE_PATH || '/';

const MainApp = () => {
  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      <AppContainer defaultTheme="light">
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorRender
              error={error as Error}
              resetErrorBoundary={resetErrorBoundary}
            />
          )}
        >
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </AppContainer>
    </BrowserRouter>
  );
};

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (window.location.hostname === 'calendar.alphapulsex.online' || import.meta.env.VITE_FEISHU_OAUTH === 'true') {
    try {
      const response = await axios.get<{ user?: { open_id?: string } }>('/api/auth/me', { validateStatus: () => true });
      if (response.status === 401) {
        const { pathname, search, hash } = window.location;
        window.location.replace('/api/auth/feishu/login?' + new URLSearchParams({ returnTo: pathname + search + hash }));
        return;
      }
      if (response.status !== 200 || !response.data.user?.open_id) throw new Error('auth');
    } catch {
      root.render(<p role="alert">暂时无法进入鸭鸭日历，请确认账号可用后刷新重试。</p>);
      return;
    }
  }
  root.render(<MainApp />);
}

void start();
