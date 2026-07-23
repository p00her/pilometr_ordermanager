import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { ThemeContextProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import OrdersList from './pages/OrdersList';
import OrderDetail from './pages/OrderDetail';
import System from './pages/System';
import Login from './pages/Login';
import MaxApp from './pages/MaxApp';

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
      </BrowserRouter>
    </ThemeContextProvider>
  );
}
