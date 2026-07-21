import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeContextProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import OrdersList from './pages/OrdersList';
import OrderDetail from './pages/OrderDetail';
import Login from './pages/Login';
import MaxApp from './pages/MaxApp';
import MaxSettings from './pages/MaxSettings';
import { checkAuth } from './api/auth';

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

  if (authed === null) return null;

  if (!authed) {
    return (
      <ThemeContextProvider>
        <Login onLogin={(name) => { setAuthed(true); setUserName(name); }} />
      </ThemeContextProvider>
    );
  }

  return (
    <ThemeContextProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/max-app" element={<MaxApp />} />
          <Route path="/" element={<Layout userName={userName} onLogout={() => setAuthed(false)} />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<OrdersList />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="max-settings" element={<MaxSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeContextProvider>
  );
}
