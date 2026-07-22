import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Paper,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { registerChat, unregisterChat } from '../api/maxApi';

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
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
        setMessage('initDataUnsafe отсутствует. WebApp есть, но нет данных инициализации.');
        setStatus('error');
      }
    } else {
      setMessage('Объект WebApp не найден. Откройте страницу из приложения MAX через бота.');
      setStatus('error');
    }
    setStatus('ready');
  }, []);

  const handleRegister = async () => {
    const effectiveId = userId || chatId;
    if (!effectiveId) {
      setMessage('Не удалось определить chat_id. Откройте страницу из приложения MAX.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const res = await registerChat(effectiveId, email);
      if (res.ok) {
        setStatus('done');
        setMessage('Подключение MAX выполнено! Теперь вы будете получать уведомления о заказах.');
      } else {
        setStatus('error');
        setMessage('Ошибка: ' + ((res as any).error || 'неизвестная'));
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
        setStatus('ready');
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

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 6, p: 3 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom align="center">Подключение MAX</Typography>

        {status === 'done' ? (
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelIcon />}
              onClick={handleUnregister}
              disabled={status === 'loading'}
            >
              Отписаться от уведомлений
            </Button>
          </Box>
        ) : (
          <>
            {userId && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Подключено к чату MAX (ID: {userId})
              </Alert>
            )}

            <TextField
              label="Email (логин)"
              fullWidth size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
              helperText="Укажите ваш email для связи с аккаунтом"
            />

            {!userId && !chatId && (
              <TextField
                label="Chat ID (вручную)"
                fullWidth size="small"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                sx={{ mb: 2 }}
                helperText="Введите chat_id вручную или откройте через бота в MAX"
              />
            )}

            <Button
              variant="contained" fullWidth
              onClick={handleRegister}
              disabled={status === 'loading' || !(userId || chatId)}
            >
              {status === 'loading' ? <CircularProgress size={20} /> : 'Подключить'}
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
