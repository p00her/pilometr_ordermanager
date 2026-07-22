import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  LinearProgress,
  Alert,
  Switch,
  FormControlLabel,
  Chip,
} from '@mui/material';
import axios from 'axios';
import { triggerFullSync, getCachedOrders } from '../api/ordersApi';
import { setMeta, replaceOrders } from '../db/db';

export default function System() {
  const [status, setStatus] = useState<{ count: number; fullSyncDone: boolean; lastSyncTime: string } | null>(null);
  const [progress, setProgress] = useState<{ synced: number; total: number; active: boolean }>({ synced: 0, total: 0, active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearBeforeSync, setClearBeforeSync] = useState(false);

  const fetchStatus = async () => {
    try {
      const [sr, pr] = await Promise.all([
        axios.get('/api/debug/count'),
        axios.get('/api/debug/sync-progress'),
      ]);
      setStatus(sr.data);
      setProgress(pr.data);
      setError('');
    } catch {
      setError('Не удалось получить статус');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, []);

  const handleFullSync = async () => {
    setBusy(true);
    setError('');
    try {
      await triggerFullSync(clearBeforeSync);
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const [sr, pr] = await Promise.all([
          axios.get('/api/debug/count'),
          axios.get('/api/debug/sync-progress'),
        ]);
        setStatus(sr.data);
        setProgress(pr.data);
        if (sr.data.fullSyncDone) {
          const data = await getCachedOrders();
          if (data.data.length > 0) {
            await replaceOrders(data.data);
          }
          if (data.lastSyncTime) {
            await setMeta('lastSyncTime', data.lastSyncTime);
          }
          window.dispatchEvent(new CustomEvent('order-changed'));
          break;
        }
      }
    } catch {
      setError('Ошибка запуска полной синхронизации');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Система</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Синхронизация</Typography>

          {loading ? (
            <CircularProgress size={24} />
          ) : status ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
              <Typography variant="body2">
                Заказов в кэше: <strong>{status.count}</strong>
              </Typography>
              <Typography variant="body2">
                Статус:{' '}
                <Chip
                  label={status.fullSyncDone ? 'Синхронизировано' : 'Ожидает полной синхронизации'}
                  color={status.fullSyncDone ? 'success' : 'warning'}
                  size="small"
                />
              </Typography>
              <Typography variant="body2">
                Последняя: <strong>{status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString('ru-RU') : '—'}</strong>
              </Typography>
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 2 }}>Нет данных</Typography>
          )}

          {progress.active && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress
                variant="determinate"
                value={progress.total ? (progress.synced / progress.total) * 100 : 0}
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Синхронизировано: {progress.synced} / {progress.total}
              </Typography>
            </Box>
          )}

          <FormControlLabel
            control={<Switch checked={clearBeforeSync} onChange={(e) => setClearBeforeSync(e.target.checked)} />}
            label="Очистить кэш перед синхронизацией"
            slotProps={{ typography: { variant: 'body2' } }}
            sx={{ mb: 1 }}
          />
          <Button
            variant="contained"
            onClick={handleFullSync}
            disabled={busy || progress.active}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {progress.active ? 'Выполняется...' : 'Полная синхронизация'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>MAX уведомления</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Настройка уведомлений о заказах в приложении MAX.
          </Typography>
          <Button variant="outlined" component="a" href="/max-settings">
            Настроить уведомления
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
