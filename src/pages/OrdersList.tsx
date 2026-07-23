import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material';
import axios from 'axios';
import {
  Box,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  alpha,
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
  Collapse,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SyncIcon from '@mui/icons-material/Sync';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import IconButton from '@mui/material/IconButton';
import { getCachedOrders, triggerSync, getReferenceData, API_URL } from '../api/ordersApi';
import { getAllOrders, replaceOrders, mergeOrders, getMeta, setMeta } from '../db/db';
import type { Order, ReferenceData } from '../types';
import { STATUS_COLORS, paletteColor } from '../constants';

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

export default function OrdersList() {
  const theme = useTheme();
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
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [sortField, setSortField] = useState<'number' | 'order_date'>('number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [filters, setFilters] = useState({
    number: '',
    poluchatel: '',
    phone: '+7',

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
      if (forceFull) await triggerSync();
      const data = await getCachedOrders(forceFull ? undefined : (await getMeta('lastSyncTime')) || undefined);
      if (data.data.length > 0) {
        const merged = forceFull ? await replaceOrders(data.data) : await mergeOrders(data.data);
        setOrders(merged);
      }
      if (data.lastSyncTime) {
        await setMeta('lastSyncTime', data.lastSyncTime);
        setLastSyncLabel(formatDate(data.lastSyncTime));
      }
    } catch {
      setError('Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [savedField, savedDir, ls, cachedRef, savedFilters] = await Promise.all([
        getMeta('sortField'),
        getMeta('sortDir'),
        getMeta('lastSyncTime'),
        getMeta('refData'),
        getMeta('filters'),
      ]);
      if (savedField === 'number' || savedField === 'order_date') setSortField(savedField);
      if (savedDir === 'asc' || savedDir === 'desc') setSortDir(savedDir);
      if (ls) setLastSyncLabel(formatDate(ls));
      if (cachedRef) {
        try { setRefData(JSON.parse(cachedRef)); } catch {}
      }
      if (savedFilters) {
        try { setFilters(JSON.parse(savedFilters)); } catch {}
      }

      const local = await getAllOrders();
      if (local.length > 0) {
        setOrders(local);
      }
      setLoading(false);

      const refPromise = axios.get('/api/reference').then(async (r) => {
        const d = r.data;
        if (d && typeof d === 'object' && d.o_statuses && Object.keys(d.o_statuses).length > 0) {
          return d;
        }
        const live = await getReferenceData(API_URL);
        axios.post('/api/reference', live).catch(() => {});
        return live;
      });
      Promise.all([
        refPromise,
        getCachedOrders(),
      ]).then(async ([ref, data]) => {
        const safe = ref && typeof ref === 'object' ? { o_statuses: ref.o_statuses ?? {}, d_methods: ref.d_methods ?? {}, d_statuses: ref.d_statuses ?? {}, p_methods: ref.p_methods ?? {}, p_statuses: ref.p_statuses ?? {} } : null;
        if (safe) setRefData(safe);
        setMeta('refData', JSON.stringify(safe)).catch(() => {});
        if (data.data.length > 0) {
          const replaced = await replaceOrders(data.data);
          setOrders(replaced);
        }
        if (data.lastSyncTime) {
          await setMeta('lastSyncTime', data.lastSyncTime);
        setLastSyncLabel(formatDate(data.lastSyncTime));
        }
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

  useEffect(() => {
    setMeta('filters', JSON.stringify(filters)).catch(() => {});
  }, [filters]);

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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h5">Заказы</Typography>
          {newCount > 0 && (
            <Chip label={`+${newCount}`} size="small" color="info" />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: theme.palette.action.hover, borderRadius: 1, px: 1, py: 0.5 }}>
          <IconButton
            size="small"
            color={autoRefresh ? 'primary' : 'default'}
            onClick={() => setAutoRefresh((a) => !a)}
            title={autoRefresh ? 'Остановить автообновление' : 'Включить автообновление'}
          >
            {autoRefresh ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, textAlign: 'center', lineHeight: '32px' }}>
            {syncing ? 'синхронизация...' : (lastSyncLabel || '—')}
          </Typography>
          <IconButton
            size="small"
            onClick={() => { setNewCount(0); sync(true); }}
            disabled={syncing}
            sx={{ animation: syncing ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }}
            title="Ручная синхронизация"
          >
            <SyncIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Button size="small" onClick={() => setFiltersOpen((v) => !v)}>
          {filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          Фильтры
        </Button>
      </Box>
      <Collapse in={filtersOpen}>
      <Paper elevation={1} sx={{ p: { xs: 1, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'end' }}>
          <TextField
            label="Номер"
            size="small"
            value={filters.number}
            onChange={(e) => setFilters((f) => ({ ...f, number: e.target.value }))}
            sx={{ width: { xs: '100%', sm: 100 }, maxWidth: { xs: 'none', sm: 100 } }}
          />
          <TextField
            label="Получатель"
            size="small"
            value={filters.poluchatel}
            onChange={(e) => setFilters((f) => ({ ...f, poluchatel: e.target.value }))}
            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 140 } }}
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
            sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 170 } }}
          />

          <TextField
            label="Дата с"
            type="date"
            size="small"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: { xs: '1 1 calc(50% - 12px)', sm: '0 1 auto' } }}
          />
          <TextField
            label="Дата по"
            type="date"
            size="small"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: { xs: '1 1 calc(50% - 12px)', sm: '0 1 auto' } }}
          />
          <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 200 } }}>
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
                  <MenuItem key={k} value={k} sx={{ bgcolor: (() => { const pc = paletteColor(v, k); return pc ? alpha(theme.palette[pc].main, 0.12) : undefined; })() }}>
                    <Checkbox checked={filters.statusId.includes(k)} size="small" />
                    <ListItemText primary={v} />
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 1 auto' }, minWidth: { xs: 'auto', sm: 160 } }}>
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
          <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, minWidth: { xs: '100%', sm: 200 } }}>
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
      </Collapse>

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
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Получатель</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Телефон</TableCell>
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
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{order.poluchatel}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{order.mobtelefon}</TableCell>
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
                        const pc = paletteColor(label, sid);
                        return (
                          <Chip
                            label={label}
                            size="small"
                            color={pc ?? STATUS_COLORS[String(sid)] ?? 'default'}
                            style={pc ? { backgroundColor: pc === 'error' ? alpha(theme.palette[pc].main, 0.4) : theme.palette[pc].main, color: '#fff', fontWeight: 600 } : undefined}
                            sx={{
                              whiteSpace: 'normal',
                              height: 'auto',
                              '& .MuiChip-label': { whiteSpace: 'normal', overflow: 'visible', display: 'block', textAlign: 'center' },
                            }}
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
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
          />
        </Paper>
      )}
    </Box>
  );
}
