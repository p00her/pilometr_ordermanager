import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Paper,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { registerChat, unregisterChat, checkChatRegistered } from '../api/maxApi';
import { login } from '../api/auth';

declare global {
  interface Window {
    WebApp?: {
      initData: string;
      initDataUnsafe?: {
        query_id: string;
        auth_date: number;
        hash: string;
        user?: { id: number; first_name: string; last_name: string; username?: string };
        chat?: { id: number; type: string };
        start_param?: string;
      };
      ready: () => void;
    };
  }
}

export default function MaxApp() {
  const [chatId, setChatId] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [status, setStatus] = useState<'loading' | 'login' | 'registering' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const wa = window.WebApp;
    if (wa) {
      const data = wa.initDataUnsafe;
      if (data) {
        const id = data.chat?.id || data.user?.id;
        if (id) setChatId(String(id));
        if (data.user?.id) setUserId(String(data.user.id));
        wa.ready();
      } else {
        setMessage('initDataUnsafe отсутствует.');
        setStatus('error');
        return;
      }
    } else {
      setMessage('Откройте страницу из приложения MAX через бота.');
      setStatus('error');
      return;
    }
  }, []);

  useEffect(() => {
    const effectiveId = userId || chatId;
    if (!effectiveId) return;
    checkChatRegistered(effectiveId).then((res) => {
      if (res.registered) {
        setRegisteredEmail(res.email || '');
        setMessage('Вы уже подключены к уведомлениям MAX.');
        setStatus('done');
      } else {
        setStatus('login');
      }
    }).catch(() => setStatus('login'));
  }, [chatId, userId]);

  const handleLogin = async () => {
    if (!email || !password) {
      setMessage('Введите email и пароль.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const res = await login(email, password);
      if (!res.ok) {
        setMessage(res.error || 'Неверный логин или пароль');
        setStatus('error');
        return;
      }
    } catch {
      setMessage('Ошибка сети');
      setStatus('error');
      return;
    }

    const effectiveId = userId || chatId;
    if (!effectiveId) {
      setMessage('Не удалось определить chat_id.');
      setStatus('error');
      return;
    }

    setStatus('registering');
    try {
      const reg = await registerChat(effectiveId, email);
      if (reg.ok) {
        setStatus('done');
        setMessage('Подключение MAX выполнено!');
      } else {
        setStatus('error');
        setMessage('Ошибка: ' + ((reg as any).error || 'неизвестная'));
      }
    } catch {
      setStatus('error');
      setMessage('Ошибка сети');
    }
  };

  const handleUnregister = async () => {
    const effectiveId = userId || chatId;
    if (!effectiveId) return;
    setStatus('loading');
    try {
      const res = await unregisterChat(effectiveId);
      if (res.ok) {
        setStatus('login');
        setMessage('Вы отписались от уведомлений MAX.');
      } else {
        setStatus('error');
        setMessage('Ошибка: ' + (res.error || 'неизвестная'));
      }
    } catch {
      setStatus('error');
      setMessage('Ошибка сети');
    }
  };

  const effectiveId = userId || chatId;

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 6, p: 3 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom align="center">Подключение MAX</Typography>

        {status === 'done' ? (
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>
            {effectiveId && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Chat ID: {effectiveId}
              </Typography>
            )}
            {registeredEmail && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Email: {registeredEmail}
              </Typography>
            )}
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelIcon />}
              onClick={handleUnregister}
            >
              Отписаться от уведомлений
            </Button>
          </Box>
        ) : (
          <>
            {effectiveId && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Chat ID: {effectiveId}
              </Alert>
            )}

            <TextField
              label="Email"
              fullWidth size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
            />

            <TextField
              label="Пароль"
              type="password"
              fullWidth size="small"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Button
              variant="contained" fullWidth
              onClick={handleLogin}
              disabled={status === 'loading' || status === 'registering' || !email || !password || !effectiveId}
            >
              {(status === 'loading' || status === 'registering') ? <CircularProgress size={20} /> : 'Войти'}
            </Button>

            {message && (
              <Alert severity={status === 'error' ? 'error' : 'info'} sx={{ mt: 2 }}>
                {message}
              </Alert>
            )}
          </>
        )}
      </Paper>
    </Box>
  );
}
