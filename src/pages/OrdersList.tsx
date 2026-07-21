import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  TablePagination,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Checkbox,
  ListItemText,
} from '@mui/material';
import { getOrdersListSince, getReferenceData, API_URL } from '../api/ordersApi';
import { autoNotify } from '../api/maxApi';
import { getAllOrders, mergeOrders, replaceOrders, getMeta, setMeta } from '../db/db';
import type { Order, ReferenceData } from '../types';

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  '97': 'info',
  '98': 'success',
  '99': 'warning',
  '100': 'success',
  '101': 'success',
  '95': 'error',
  '96': 'error',
  '102': 'default',
  '4735558': 'error',
};

function reverseMap(obj: Record<number, string>): Record<string, string> {
  const rev: Record<string, string> = {};
  Object.entries(obj).forEach(([k, v]) => { rev[v] = k; });
  return rev;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function shouldNightlyFullSync(): Promise<boolean> {
  const lastFull = await getMeta('lastFullSyncDate');
  const today = new Date().toISOString().slice(0, 10);
  if (lastFull === today) return false;
  await setMeta('lastFullSyncDate', today);
  return true;
}

export default function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncLabel, setLastSyncLabel] = useState('');
  const [refData, setRefData] = useState<ReferenceData | null>(null);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const [sortField, setSortField] = useState<'number' | 'order_date'>('number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [filters, setFilters] = useState({
    number: '',
    poluchatel: '',
    phone: '+7',
    email: '',
    dateFrom: '',
    dateTo: '',
    statusId: [] as string[],
    paymentId: '',
    deliveryId: [] as string[],
  });

  const handleSort = (field: 'number' | 'order_date') => {
    const newDir = sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortField(field);
    setSortDir(newDir);
    setMeta('sortField', field);
    setMeta('sortDir', newDir);
  };

  const sync = useCallback(async (forceFull = false) => {
    setSyncing(true);
    try {
      if (forceFull || await shouldNightlyFullSync()) {
        const data = await getOrdersListSince(API_URL, '', 0);
        const replaced = await replaceOrders(data.data ?? []);
        setOrders(replaced);
        if (!refData && (data.o_statuses || data.p_methods)) {
          const ref = {
            o_statuses: data.o_statuses ?? {},
            d_methods: data.d_methods ?? {},
            d_statuses: data.d_statuses ?? {},
            p_methods: data.p_methods ?? {},
            p_statuses: data.p_statuses ?? {},
          };
          setRefData(ref);
          setMeta('refData', JSON.stringify(ref));
        }
      } else {
        const modifiedSince = await getMeta('lastSyncTime');
        const prevCount = (await getAllOrders()).length;
        const data = await getOrdersListSince(API_URL, modifiedSince ?? '', 0);
        const merged = await mergeOrders(data.data ?? []);
        setOrders(merged);
        const added = merged.length - prevCount;
        if (added > 0) setNewCount((c) => c + added);
      }

      const now = new Date().toISOString();
      await setMeta('lastSyncTime', now);
      setLastSyncLabel(formatDate(now));

      autoNotify().catch(() => {});
    } catch {
      setError('Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }, [refData]);

  useEffect(() => {
    (async () => {
      const [savedField, savedDir, ls] = await Promise.all([
        getMeta('sortField'),
        getMeta('sortDir'),
        getMeta('lastSyncTime'),
      ]);
      if (savedField === 'number' || savedField === 'order_date') setSortField(savedField);
      if (savedDir === 'asc' || savedDir === 'desc') setSortDir(savedDir);
      if (ls) setLastSyncLabel(formatDate(ls));

      const local = await getAllOrders();
      if (local.length > 0) {
        setOrders(local);
      }
      setLoading(false);

      Promise.all([
        getReferenceData(API_URL),
        getOrdersListSince(API_URL, '', 0),
      ]).then(async ([ref, data]) => {
        setRefData(ref);
        const replaced = await replaceOrders(data.data ?? []);
        setOrders(replaced);
        const now = new Date().toISOString();
        await setMeta('lastSyncTime', now);
        setLastSyncLabel(formatDate(now));
        setInitialLoadDone(true);
      }).catch(() => {
        setInitialLoadDone(true);
        if (!local.length) setError('Ошибка загрузки');
      });
    })();
  }, []);

  useEffect(() => {
    const handler = () => sync();
    window.addEventListener('order-changed', handler);
    return () => window.removeEventListener('order-changed', handler);
  }, [sync]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => sync(), 30000);
    return () => clearInterval(id);
  }, [autoRefresh, sync]);

  const statusNameToId = useMemo(() => {
    return refData?.o_statuses ? reverseMap(refData.o_statuses) : {};
  }, [refData]);

  const processedOrders = useMemo(() => {
    const filtered = orders.filter((o) => {
      if (filters.number && !String(o.number).includes(filters.number)) return false;
      if (filters.poluchatel && !(o.poluchatel ?? '').toLowerCase().includes(filters.poluchatel.toLowerCase())) return false;
      if (filters.phone) {
        const phoneDigits = filters.phone.replace(/\D/g, '');
        if (phoneDigits.length > 1 && !(o.mobtelefon ?? '').replace(/\D/g, '').includes(phoneDigits)) return false;
      }
      if (filters.email && !(o.email ?? '').toLowerCase().includes(filters.email.toLowerCase())) return false;
      if (filters.dateFrom && o.order_date) {
        const dateParts = o.order_date.split(' ')[0].split('.');
        if (dateParts.length === 3) {
          const ymd = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
          if (ymd < filters.dateFrom) return false;
        }
      }
      if (filters.dateTo && o.order_date) {
        const dateParts = o.order_date.split(' ')[0].split('.');
        if (dateParts.length === 3) {
          const ymd = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
          if (ymd > filters.dateTo) return false;
        }
      }
      const oStatusId = String(o.status_id ?? statusNameToId[o.order_status ?? '']);
      if (filters.statusId.length > 0 && !filters.statusId.includes(oStatusId)) return false;
      const oPaymentId = String(o.payment_id ?? reverseMap(refData?.p_methods ?? {})[o.payment_method ?? ''] ?? '');
      if (filters.paymentId && oPaymentId !== filters.paymentId) return false;
      const oDeliveryId = String(o.delivery_id ?? reverseMap(refData?.d_methods ?? {})[o.delivery_method ?? ''] ?? '');
      if (filters.deliveryId.length > 0 && !filters.deliveryId.includes(oDeliveryId)) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number'
        ? aVal - (bVal as number)
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [orders, filters, statusNameToId, sortField, sortDir]);

  const pageOrders = useMemo(() => {
    return processedOrders.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  }, [processedOrders, page, rowsPerPage]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5">Заказы</Typography>
          <Typography variant="caption" color="text.secondary">
            {autoRefresh ? '🔄 авт.' : '⏸ пауза'}
          </Typography>
          {lastSyncLabel && (
            <Typography variant="caption" color="text.secondary">
              {lastSyncLabel}
            </Typography>
          )}
          {newCount > 0 && (
            <Chip label={`+${newCount}`} size="small" color="info" />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant={autoRefresh ? 'outlined' : 'contained'}
            color={autoRefresh ? 'inherit' : 'primary'}
            onClick={() => setAutoRefresh((a) => !a)}
          >
            {autoRefresh ? 'Пауза' : 'Авто'}
          </Button>
          <Button size="small" variant="outlined" onClick={() => { setNewCount(0); sync(true); }} disabled={syncing}>
            {syncing ? '...' : 'Руч. синх.'}
          </Button>
        </Box>
      </Box>

      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'end' }}>
          <TextField
            label="Номер"
            size="small"
            value={filters.number}
            onChange={(e) => setFilters((f) => ({ ...f, number: e.target.value }))}
            sx={{ width: 100 }}
          />
          <TextField
            label="Получатель"
            size="small"
            value={filters.poluchatel}
            onChange={(e) => setFilters((f) => ({ ...f, poluchatel: e.target.value }))}
            sx={{ width: 160 }}
          />
          <TextField
            label="Телефон"
            size="small"
            value={filters.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
              if (digits.length === 0) { setFilters((f) => ({ ...f, phone: '+7' })); return; }
              let formatted = '+7';
              if (digits.length > 1) formatted += ' (' + digits.slice(1, 4);
              if (digits.length > 4) formatted += ') ' + digits.slice(4, 7);
              if (digits.length > 7) formatted += '-' + digits.slice(7, 9);
              if (digits.length > 9) formatted += '-' + digits.slice(9, 11);
              setFilters((f) => ({ ...f, phone: formatted }));
            }}
            placeholder="+7 (000) 000-00-00"
            sx={{ width: 190 }}
          />
          <TextField
            label="E-mail"
            size="small"
            value={filters.email}
            onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
            placeholder="фильтр по email"
            sx={{ width: 190 }}
          />
          <TextField
            label="Дата с"
            type="date"
            size="small"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Дата по"
            type="date"
            size="small"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Статус</InputLabel>
            <Select
              multiple
              value={filters.statusId}
              label="Статус"
              onChange={(e) => setFilters((f) => ({ ...f, statusId: e.target.value as string[] }))}
              renderValue={(selected) => {
                if (selected.length === 0) return 'Все';
                return selected.map((id) => refData?.o_statuses[Number(id)] ?? id).join(', ');
              }}
            >
              {refData?.o_statuses &&
                Object.entries(refData.o_statuses).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    <Checkbox checked={filters.statusId.includes(k)} size="small" />
                    <ListItemText primary={v} />
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Способ оплаты</InputLabel>
            <Select
              value={filters.paymentId}
              label="Способ оплаты"
              onChange={(e) => setFilters((f) => ({ ...f, paymentId: e.target.value }))}
            >
              <MenuItem value="">Все</MenuItem>
              {refData?.p_methods &&
                Object.entries(refData.p_methods).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Способ получения</InputLabel>
            <Select
              multiple
              value={filters.deliveryId}
              label="Способ получения"
              onChange={(e) => setFilters((f) => ({ ...f, deliveryId: e.target.value as string[] }))}
              renderValue={(selected) => {
                if (selected.length === 0) return 'Все';
                return selected.map((id) => refData?.d_methods[Number(id)] ?? id).join(', ');
              }}
            >
              {refData?.d_methods &&
                Object.entries(refData.d_methods).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    <Checkbox checked={filters.deliveryId.includes(k)} size="small" />
                    <ListItemText primary={v} />
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {!loading && (
        <Paper elevation={2}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sortDirection={sortField === 'number' ? sortDir : false}>
                    <TableSortLabel
                      active={sortField === 'number'}
                      direction={sortField === 'number' ? sortDir : 'asc'}
                      onClick={() => handleSort('number')}
                    >
                      №
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={sortField === 'order_date' ? sortDir : false}>
                    <TableSortLabel
                      active={sortField === 'order_date'}
                      direction={sortField === 'order_date' ? sortDir : 'asc'}
                      onClick={() => handleSort('order_date')}
                    >
                      Дата
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Получатель</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Телефон</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>E-mail</TableCell>
                  <TableCell>Сумма</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Способ получения</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Способ оплаты</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Статус оплаты</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    hover
                    onClick={() => navigate(`/orders/${order.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{order.number}</TableCell>
                    <TableCell>{order.order_date}</TableCell>
                    <TableCell>{order.poluchatel}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{order.mobtelefon}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{order.email ?? '—'}</TableCell>
                    <TableCell>
                      {order.price?.toLocaleString('ru-RU', {
                        style: 'currency',
                        currency: 'RUB',
                      })}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const label = refData?.o_statuses[order.status_id ?? -1] ?? order.order_status ?? '—';
                        const sid = order.status_id ?? statusNameToId[label];
                        const isOrderPaying = label.toLowerCase().includes('оплачивается');
                        return (
                          <Chip
                            label={label}
                            size="small"
                            color={isOrderPaying ? 'default' : (STATUS_COLORS[String(sid)] ?? 'default')}
                            style={isOrderPaying ? { backgroundColor: '#636B2F', color: '#fff', fontWeight: 600 } : undefined}
                          />
                        );
                      })()}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {refData?.d_methods[order.delivery_id ?? -1] ??
                        order.delivery_method ??
                        '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {refData?.p_methods[order.payment_id ?? -1] ??
                        order.payment_method ??
                        '—'}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      {refData?.p_statuses[order.payment_status_id ?? -1] ??
                        order.payment_status ??
                        '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {pageOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center">
                      {initialLoadDone ? 'Нет заказов' : <CircularProgress size={24} />}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={processedOrders.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Строк на странице"
          />
        </Paper>
      )}
    </Box>
  );
}
