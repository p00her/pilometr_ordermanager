import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Switch,
  FormControlLabel,
  Chip,
} from '@mui/material';
import axios from 'axios';
import { triggerSync, triggerFullSync, getCachedOrders } from '../api/ordersApi';
import { getMeta, setMeta, mergeOrders } from '../db/db';

export default function System() {
  const [status, setStatus] = useState<{ count: number; fullSyncDone: boolean; lastSyncTime: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearBeforeSync, setClearBeforeSync] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/debug/count');
      setStatus(res.data);
      setError('');
    } catch {
      setError('Не удалось получить статус');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, []);

  const handleFullSync = async () => {
    setBusy(true);
    setError('');
    try {
      await triggerFullSync(clearBeforeSync);
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await axios.get('/api/debug/count');
        setStatus(res.data);
        if (res.data.fullSyncDone) {
          const data = await getCachedOrders();
          if (data.data.length > 0) {
            const { replaceOrders } = await import('../db/db');
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

  const handleSync = async () => {
    setBusy(true);
    setError('');
    try {
      await triggerSync();
      const since = (await getMeta('lastSyncTime')) || undefined;
      const data = await getCachedOrders(since);
      if (data.data.length > 0) {
        await mergeOrders(data.data);
      }
      if (data.lastSyncTime) {
        await setMeta('lastSyncTime', data.lastSyncTime);
      }
      window.dispatchEvent(new CustomEvent('order-changed'));
      setTimeout(fetchStatus, 500);
    } catch {
      setError('Ошибка синхронизации');
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
          <Typography variant="h6" gutterBottom>Статус синхронизации</Typography>
          {loading ? (
            <CircularProgress size={24} />
          ) : status ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                Заказов в кэше: <strong>{status.count}</strong>
              </Typography>
              <Typography variant="body2">
                Полная синхронизация:{' '}
                <Chip
                  label={status.fullSyncDone ? 'Выполнена' : 'Не выполнена'}
                  color={status.fullSyncDone ? 'success' : 'warning'}
                  size="small"
                />
              </Typography>
              <Typography variant="body2">
                Последняя синхронизация: <strong>{status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString('ru-RU') : '—'}</strong>
              </Typography>
            </Box>
          ) : (
            <Typography color="text.secondary">Нет данных</Typography>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Управление</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={<Switch checked={clearBeforeSync} onChange={(e) => setClearBeforeSync(e.target.checked)} />}
              label="Очистить кэш перед полной синхронизацией"
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={handleFullSync}
                disabled={busy}
              >
                {busy ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
                Полная синхронизация
              </Button>
              <Button
                variant="outlined"
                onClick={handleSync}
                disabled={busy}
              >
                Инкрементальная синхронизация
              </Button>
            </Box>
          </Box>
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
