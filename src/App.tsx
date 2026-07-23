import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { ThemeContextProvider } from './context/ThemeContext';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrdersList = lazy(() => import('./pages/OrdersList'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const System = lazy(() => import('./pages/System'));
const Login = lazy(() => import('./pages/Login'));
const MaxApp = lazy(() => import('./pages/MaxApp'));

import { checkAuth, logout as apiLogout } from './api/auth';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    checkAuth()
      .then((res) => {
        setAuthed(res.ok);
        if (res.name) setUserName(res.name);
      })
      .catch(() => {
        setAuthed(false);
      });
  }, []);

  if (authed === null) return (
    <ThemeContextProvider>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    </ThemeContextProvider>
  );

  return (
    <ThemeContextProvider>
      <BrowserRouter>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}><CircularProgress /></Box>}>
        <Routes>
          <Route path="/max-app" element={<MaxApp />} />
          <Route path="/*" element={
            !authed
              ? <Login onLogin={(name) => { setAuthed(true); setUserName(name); }} />
              : <Layout userName={userName} onLogout={async () => { await apiLogout(); setAuthed(false); }} />
          }>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<OrdersList />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="system" element={<System />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeContextProvider>
  );
}
