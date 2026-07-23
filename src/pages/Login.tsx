import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { login } from '../api/auth';

export default function Login({ onLogin }: { onLogin: (name: string) => void }) {
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login(loginField, password);
      if (res.ok) {
        onLogin(res.name || '');
      } else {
        setError(res.error || 'Ошибка входа');
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: 400 }} elevation={4}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              component="img"
              src="https://pilometr.ru/templates/pilometr/newfront/img/new_new/logo_white.svg"
              alt="Pilometr"
              sx={{ height: 48, mb: 1, bgcolor: '#7c965a', p: 1, borderRadius: 1 }}
            />
            <Typography variant="h6">Управление заказами</Typography>
          </Box>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="E-mail"
              size="small"
              fullWidth
              value={loginField}
              onChange={(e) => setLoginField(e.target.value)}
              autoFocus
            />
            <TextField
              label="Пароль"
              type={showPassword ? 'text' : 'password'}
              size="small"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" size="small">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" fullWidth disabled={loading || !loginField || !password}>
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Войти'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
