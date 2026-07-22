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
  FormGroup,
  Checkbox,
  Divider,
  Paper,
} from '@mui/material';
import axios from 'axios';
import SendToMobileIcon from '@mui/icons-material/SendToMobile';
import { triggerFullSync, getCachedOrders } from '../api/ordersApi';
import { setMeta, replaceOrders } from '../db/db';
import { getMaxSettings, updateMaxSettings, type MaxNotificationSettings } from '../api/maxApi';

type NotifyKey = 'new_order' | 'order_cancelled';

interface NotifySetting {
  key: NotifyKey;
  label: string;
  desc: string;
}

const NOTIFY_ITEMS: NotifySetting[] = [
  { key: 'new_order', label: 'Новый заказ', desc: 'Автоматически при появлении нового заказа в системе' },
  { key: 'order_cancelled', label: 'Заказ отменён', desc: 'Когда заказ получает статус «Отменён»' },
];

export default function System() {
  const [status, setStatus] = useState<{ count: number; fullSyncDone: boolean; lastSyncTime: string } | null>(null);
  const [progress, setProgress] = useState<{ synced: number; total: number; active: boolean }>({ synced: 0, total: 0, active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearBeforeSync, setClearBeforeSync] = useState(false);

  const [maxSettings, setMaxSettings] = useState<MaxNotificationSettings>({
    new_order: true,
    order_cancelled: false,
    delivery_ids: [],
  });
  const [dMethods, setDMethods] = useState<Record<string, string>>({});
  const [maxLoading, setMaxLoading] = useState(true);
  const [maxSaving, setMaxSaving] = useState(false);
  const [maxError, setMaxError] = useState('');
  const [maxSuccess, setMaxSuccess] = useState('');

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

  useEffect(() => {
    getMaxSettings()
      .then((res) => {
        if (res.ok) {
          if (res.settings) setMaxSettings(res.settings);
          if (res.d_methods) setDMethods(res.d_methods);
        }
      })
      .catch(() => setMaxError('Не удалось загрузить настройки MAX'))
      .finally(() => setMaxLoading(false));
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

  const handleMaxToggle = (key: NotifyKey) => {
    setMaxSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeliveryToggle = (id: string) => {
    setMaxSettings((prev) => {
      const num = Number(id);
      const exists = prev.delivery_ids.includes(num);
      return {
        ...prev,
        delivery_ids: exists
          ? prev.delivery_ids.filter((d) => d !== num)
          : [...prev.delivery_ids, num],
      };
    });
  };

  const handleDeliveryAll = () => {
    setMaxSettings((prev) => ({
      ...prev,
      delivery_ids: prev.delivery_ids.length === 0
        ? Object.keys(dMethods).map(Number)
        : [],
    }));
  };

  const handleMaxSave = async () => {
    setMaxSaving(true);
    setMaxError('');
    setMaxSuccess('');
    try {
      const res = await updateMaxSettings(maxSettings);
      if (res.ok) {
        setMaxSuccess('Настройки MAX сохранены');
      } else {
        setMaxError('Ошибка сохранения');
      }
    } catch {
      setMaxError('Ошибка сети');
    } finally {
      setMaxSaving(false);
    }
  };

  const allSelected = maxSettings.delivery_ids.length === Object.keys(dMethods).length;
  const nothingSelected = maxSettings.delivery_ids.length === 0;

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

      <Card sx={{ mb: 3 }}>
        <CardContent>
          {maxError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMaxError('')}>{maxError}</Alert>}
          {maxSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMaxSuccess('')}>{maxSuccess}</Alert>}

          {maxLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress size={24} /></Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SendToMobileIcon color="primary" />
                <Typography variant="h6">MAX уведомления</Typography>
              </Box>

              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Типы событий</Typography>
                <FormGroup>
                  {NOTIFY_ITEMS.map((item) => (
                    <FormControlLabel
                      key={item.key}
                      control={<Switch checked={maxSettings[item.key]} onChange={() => handleMaxToggle(item.key)} />}
                      label={
                        <Box>
                          <Typography variant="body1">{item.label}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.desc}</Typography>
                        </Box>
                      }
                      sx={{ mb: 0.5 }}
                    />
                  ))}
                </FormGroup>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Способы получения</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Получать уведомления только для выбранных способов получения. Если ничего не выбрано — уведомления приходят по всем.
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && !nothingSelected}
                        onChange={handleDeliveryAll}
                      />
                    }
                    label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Все способы</Typography>}
                    sx={{ mb: 0.5 }}
                  />
                  {Object.entries(dMethods)
                    .sort(([, a], [, b]) => a.localeCompare(b))
                    .map(([id, name]) => (
                      <FormControlLabel
                        key={id}
                        control={
                          <Checkbox
                            checked={maxSettings.delivery_ids.includes(Number(id))}
                            onChange={() => handleDeliveryToggle(id)}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2">{name}</Typography>}
                        sx={{ ml: 3, mb: 0 }}
                      />
                    ))}
                </FormGroup>
                {nothingSelected && Object.keys(dMethods).length > 0 && (
                  <Chip label="Уведомления по всем способам" size="small" color="info" sx={{ mt: 1 }} />
                )}
              </Paper>

              <Button variant="contained" onClick={handleMaxSave} disabled={maxSaving}>
                {maxSaving ? 'Сохранение...' : 'Сохранить настройки MAX'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
