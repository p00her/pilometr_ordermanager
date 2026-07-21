import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormGroup,
  FormControlLabel,
  Switch,
  Checkbox,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from '@mui/material';
import SendToMobileIcon from '@mui/icons-material/SendToMobile';
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

export default function MaxSettings() {
  const [settings, setSettings] = useState<MaxNotificationSettings>({
    new_order: true,
    order_cancelled: false,
    delivery_ids: [],
  });
  const [dMethods, setDMethods] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getMaxSettings()
      .then((res) => {
        if (res.ok) {
          if (res.settings) setSettings(res.settings);
          if (res.d_methods) setDMethods(res.d_methods);
        }
      })
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (key: NotifyKey) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeliveryToggle = (id: string) => {
    setSettings((prev) => {
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
    setSettings((prev) => ({
      ...prev,
      delivery_ids: prev.delivery_ids.length === 0
        ? Object.keys(dMethods).map(Number)
        : [],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await updateMaxSettings(settings);
      if (res.ok) {
        setSuccess('Настройки сохранены');
      } else {
        setError('Ошибка сохранения');
      }
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const allSelected = settings.delivery_ids.length === Object.keys(dMethods).length;
  const nothingSelected = settings.delivery_ids.length === 0;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Настройки уведомлений MAX
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <SendToMobileIcon color="primary" />
          <Typography variant="h6">Типы событий</Typography>
        </Box>
        <FormGroup>
          {NOTIFY_ITEMS.map((item) => (
            <FormControlLabel
              key={item.key}
              control={<Switch checked={settings[item.key]} onChange={() => handleToggle(item.key)} />}
              label={
                <Box>
                  <Typography variant="body1">{item.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.desc}</Typography>
                </Box>
              }
              sx={{ mb: 1 }}
            />
          ))}
        </FormGroup>
      </Paper>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <SendToMobileIcon color="primary" />
          <Typography variant="h6">Способы получения</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Получать уведомления только для выбранных способов получения. Если ничего не выбрано — уведомления приходят по всем.
        </Typography>
        <Divider sx={{ mb: 2 }} />
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
                    checked={settings.delivery_ids.includes(Number(id))}
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

      <Box sx={{ mb: 3 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </Button>
      </Box>

      <Paper elevation={1} sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Чтобы подключить или отключить MAX уведомления, используйте пункт «MAX» в боковом меню.
          Уведомления приходят в приложение MAX на ваш телефон.
        </Typography>
      </Paper>
    </Box>
  );
}
