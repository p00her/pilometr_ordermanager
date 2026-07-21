import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import { getStats, API_URL } from '../api/ordersApi';
import type { StatsResponse } from '../types';

function formatPrice(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(n);
}

const GROUP_COLORS: Record<string, string> = {
  in_progress: 'info',
  ready: 'success',
  closed: 'default',
  cancelled: 'error',
};

const GROUP_LABELS: Record<string, string> = {
  in_progress: 'В работе',
  ready: 'Готовы',
  closed: 'Завершённые',
  cancelled: 'Отменённые',
};

function StatCard({
  title,
  data,
  color,
}: {
  title: string;
  data: { total: number; total_order_price: number; total_weight: number; total_volume: number };
  color: string;
}) {
  return (
    <Card sx={{ borderLeft: 4, borderColor: color }} elevation={2}>
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5">{data.total}</Typography>
        <Typography variant="body2">
          Сумма: {formatPrice(data.total_order_price)}
        </Typography>
        <Typography variant="body2">
          Вес: {data.total_weight.toFixed(2)} кг
        </Typography>
        <Typography variant="body2">
          Объем: {data.total_volume.toFixed(3)} м³
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getStats(API_URL, dateFrom, dateTo);
      if (!data || typeof data.total === 'undefined') {
        setStats(null);
        return;
      }
      const fill = { total: 0, total_order_price: 0, total_weight: 0, total_volume: 0 };
      (['in_progress', 'ready', 'closed', 'cancelled'] as const).forEach((g) => {
        if (!data.total[g]) data.total[g] = { ...fill };
      });
      Object.values(data.by_delivery || {}).forEach((group) => {
        (['in_progress', 'ready', 'closed', 'cancelled'] as const).forEach((g) => {
          if (!group[g]) group[g] = { ...fill };
        });
      });
      setStats(data);
    } catch {
      setError('Ошибка загрузки статистики');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (dateFrom && dateTo) fetchStats();
  }, [fetchStats, dateFrom, dateTo]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Статистика заказов
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          label="Дата с"
          type="date"
          size="small"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Дата по"
          type="date"
          size="small"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {stats && (
        <>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {(['in_progress', 'ready', 'closed', 'cancelled'] as const).map((g) => (
              <Grid size={{ xs: 12, md: 3 }} key={g}>
                <StatCard
                  title={GROUP_LABELS[g]}
                  data={stats.total[g] ?? { total: 0, total_order_price: 0, total_weight: 0, total_volume: 0 }}
                  color={`${GROUP_COLORS[g]}.main`}
                />
              </Grid>
            ))}
          </Grid>

          <Card elevation={2} sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                По способам получения
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Способ получения</TableCell>
                      <TableCell align="center">Всего</TableCell>
                      {(['in_progress', 'ready', 'closed', 'cancelled'] as const).map((g) => (
                        <TableCell align="center" key={g}>{GROUP_LABELS[g]}</TableCell>
                      ))}
                      <TableCell align="right">Сумма</TableCell>
                      <TableCell align="right">Вес</TableCell>
                      <TableCell align="right">Объём</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(stats.by_delivery).map(([deliveryId, group]) => (
                      <TableRow key={deliveryId}>
                        <TableCell>
                          {stats.d_methods[deliveryId] || `ID ${deliveryId}`}
                        </TableCell>
                        <TableCell align="center">{group.total}</TableCell>
                        {(['in_progress', 'ready', 'closed', 'cancelled'] as const).map((g) => (
                          <TableCell align="center" key={g}>
                            <Chip
                              label={group[g]?.total ?? 0}
                              size="small"
                              color={group[g]?.total ? GROUP_COLORS[g] as 'info' | 'success' | 'default' | 'error' : 'default'}
                              variant={group[g]?.total ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                        ))}
                        <TableCell align="right">{formatPrice(group.total_order_price)}</TableCell>
                        <TableCell align="right">{group.total_weight.toFixed(2)}</TableCell>
                        <TableCell align="right">{group.total_volume.toFixed(3)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Итого
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    Заказов
                  </Typography>
                  <Typography variant="h6">{stats.total.total}</Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    Сумма
                  </Typography>
                  <Typography variant="h6">
                    {formatPrice(stats.total.total_order_price)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    Вес
                  </Typography>
                  <Typography variant="h6">
                    {stats.total.total_weight.toFixed(2)} кг
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    Объем
                  </Typography>
                  <Typography variant="h6">
                    {stats.total.total_volume.toFixed(3)} м³
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
