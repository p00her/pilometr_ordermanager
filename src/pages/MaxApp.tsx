import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Paper,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { registerChat } from '../api/maxApi';

declare global {
  interface Window {
    WebApp?: {
      initData: { chat_id?: string; user_id?: number };
      ready: () => void;
    };
  }
}

export default function MaxApp() {
  const [chatId, setChatId] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (window.WebApp?.initData) {
      const data = window.WebApp.initData;
      if (data.chat_id) setChatId(data.chat_id);
      window.WebApp.ready();
      setStatus('ready');
    } else {
      setStatus('ready');
    }
  }, []);

  const handleRegister = async () => {
    if (!chatId) {
      setMessage('Не удалось определить chat_id. Откройте страницу из приложения MAX.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const res = await registerChat(chatId, email);
      if (res.ok) {
        setStatus('done');
        setMessage('Подключение MAX выполнено! Теперь вы будете получать уведомления о заказах.');
      } else {
        setStatus('error');
        setMessage('Ошибка при подключении');
      }
    } catch {
      setStatus('error');
      setMessage('Ошибка сети');
    }
  };

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 6, p: 3 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom align="center">
          Подключение MAX
        </Typography>

        {status === 'done' ? (
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Alert severity="success">{message}</Alert>
          </Box>
        ) : (
          <>
            {chatId && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Подключено к чату MAX (ID: {chatId})
              </Alert>
            )}

            <TextField
              label="Email (логин)"
              fullWidth
              size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
              helperText="Укажите ваш email для связи с аккаунтом"
            />

            {!chatId && (
              <>
                <TextField
                  label="Chat ID (вручную)"
                  fullWidth
                  size="small"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  sx={{ mb: 2 }}
                  helperText="Введите chat_id вручную или откройте через бота в MAX"
                />
              </>
            )}

            <Button
              variant="contained"
              fullWidth
              onClick={handleRegister}
              disabled={status === 'loading' || !chatId}
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
