import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import InventoryIcon from '@mui/icons-material/Inventory';
import SendToMobileIcon from '@mui/icons-material/SendToMobile';
import Barcode from '../components/Barcode';
import {
  getItemStorage,
  getOrderDetail,
  updateOrder,
  removeOrderItem,
  setItemAmount,
  appendItems,
  getCatalogItem,
  getReferenceData,
  API_URL,
} from '../api/ordersApi';
import { sendMaxNotification } from '../api/maxApi';
import { getOrderById, getMeta, setMeta, getCachedStorageItems, setCachedStorageItems } from '../db/db';
import { getNote as apiGetNote, saveNote as apiSaveNote } from '../api/notesApi';
import { type OrderDetail, type OrderItem, type ReferenceData, STORAGE_LABELS } from '../types';

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = Number(id);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [refData, setRefData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addBarcode, setAddBarcode] = useState('');
  const [pendingItems, setPendingItems] = useState<{ id: number; name: string; barcode: string; amount: number }[]>([]);

  const [editedFields, setEditedFields] = useState<Record<string, unknown>>({});
  const [maxSending, setMaxSending] = useState(false);
  const [maxSent, setMaxSent] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteTimer, setNoteTimer] = useState(0);

  const storageKeys = useMemo(() => {
    const did = Number(order?.delivery_id);
    if (!did) return [];
    if (did === 4243136) return ['volhov_storage'];
    if (did === 403) return ['volhov_storage', 'lomonosov_storage'];
    if (did === 1264912) return ['volhov_storage', 'skotnoe_storage'];
    if (did === 1959254) return ['volhov_storage', 'ladoga_storage'];
    if (did === 6485820) return ['volhov_storage', 'roshino_storage'];
    if (did === 1279106) return [];
    return ['volhov_storage'];
  }, [order?.delivery_id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const local = await getOrderById(orderId);
        if (local?.items) {
          setOrder(local as unknown as OrderDetail);
          setItems(local.items ?? []);
          setLoading(false);
          return;
        }
      } catch {}
      try {
        const detail = await getOrderDetail(API_URL, orderId);
        if (detail?.items) {
          setOrder(detail);
          setItems(detail.items ?? []);
        } else {
          setError('Заказ не найден');
        }
      } catch {
        setError('Ошибка загрузки заказа');
      } finally {
        setLoading(false);
      }
    })();
    getMeta('refData').then((cached) => {
      if (cached) {
        try { setRefData(JSON.parse(cached)); } catch {}
      }
    });
    getReferenceData(API_URL).then((ref) => {
      setRefData(ref);
      setMeta('refData', JSON.stringify(ref));
    }).catch(() => {});
  }, [orderId]);

  useEffect(() => {
    if (items.length === 0) return;
    const itemIds = items.map((it) => it.id).filter((id): id is number => id != null);
    if (itemIds.length === 0) return;

    getCachedStorageItems(itemIds).then((cached) => {
      if (cached.size > 0) {
        setItems((prev) => {
          let changed = false;
          const merged = prev.map((localItem) => {
            const data = localItem.id != null ? cached.get(localItem.id) : undefined;
            if (!data) return localItem;
            changed = true;
            return { ...localItem, ...data };
          });
          return changed ? merged : prev;
        });
      }
    });

    setLoadingStorage(true);
    getItemStorage(API_URL, itemIds).then((storageItems) => {
      setItems((prev) => {
        let changed = false;
        const merged = prev.map((localItem) => {
          const apiItem = storageItems.find((a) => a.id === localItem.id);
          if (!apiItem) return localItem;
          const hasStorage = apiItem.volhov_storage !== undefined;
          if (!hasStorage) return localItem;
          changed = true;
          return { ...localItem, ...apiItem };
        });
        return changed ? merged : prev;
      });
      setCachedStorageItems(storageItems.filter((s) => s.volhov_storage !== undefined));
      setLoadingStorage(false);
    }).catch(() => setLoadingStorage(false));
  }, [orderId, items.length > 0]);

  useEffect(() => {
    apiGetNote(orderId).then((text) => {
      setNote(text);
      savedNoteRef.current = text;
      noteLoadedRef.current = true;
    });
  }, [orderId]);

  const NOTE_DELAY = 5;
  const savedNoteRef = useRef('');
  const noteLoadedRef = useRef(false);

  const saveNoteLocally = useCallback(async (text: string) => {
    setNoteSaving(true);
    await apiSaveNote(orderId, text);
    savedNoteRef.current = text;
    setNoteSaving(false);
    setNoteTimer(0);
  }, [orderId]);

  useEffect(() => {
    if (noteTimer > 0) {
      const tick = setTimeout(() => setNoteTimer((t) => t - 1), 1000);
      return () => clearTimeout(tick);
    }
  }, [noteTimer]);

  useEffect(() => {
    if (!noteLoadedRef.current) return;
    if (note === savedNoteRef.current) return;
    setNoteTimer(NOTE_DELAY);
    const timer = setTimeout(() => saveNoteLocally(note), NOTE_DELAY * 1000);
    return () => clearTimeout(timer);
  }, [note, saveNoteLocally]);

  const handleFieldChange = (field: string, value: unknown) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {};

      const allFields: Record<string, unknown> = {
        poluchatel: order?.poluchatel ?? '',
        mobtelefon: order?.mobtelefon ?? '',
        email: order?.email ?? '',
        comment: order?.comment ?? '',
        delivery_id: order?.delivery_id ?? '',
        payment_id: order?.payment_id ?? '',
        payment_status_id: order?.payment_status_id ?? '',
        status_id: order?.status_id ?? '',
      };
      Object.assign(allFields, editedFields);
      Object.entries(allFields).forEach(([k, v]) => { payload[k] = v; });

      await updateOrder(API_URL, orderId, payload);

      setOrder((prev) => prev ? { ...prev, ...editedFields } as OrderDetail : null);
      setEditedFields({});
      setSuccess('Заказ сохранен');
      window.dispatchEvent(new CustomEvent('order-changed'));
    } catch {
      setError('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleSendMax = async () => {
    setMaxSending(true);
    try {
      const res = await sendMaxNotification(orderId);
      if (res.ok) {
        setMaxSent(true);
        setSuccess('Уведомление отправлено в MAX');
      } else {
        setError(res.error || 'Ошибка отправки в MAX');
      }
    } catch {
      setError('Ошибка сети при отправке в MAX');
    } finally {
      setMaxSending(false);
    }
  };

  const handleRemoveItem = async (itemIdx: number) => {
    const itemId = order?.items?.[itemIdx]?.id;
    if (itemId == null) return;
    if (!confirm('Удалить товар из заказа?')) return;
    try {
      await removeOrderItem(API_URL, orderId, itemId);
      setItems((prev) => prev.filter((_, i) => i !== itemIdx));
      window.dispatchEvent(new CustomEvent('order-changed'));
    } catch {
      setError('Ошибка удаления товара');
    }
  };

  const handleAmountChange = async (itemIdx: number, itemId: number | undefined, value: number) => {
    if (value < 1) return;
    if (itemId == null) return;
    try {
      await setItemAmount(API_URL, orderId, [{ id: itemId, value }]);
      setItems((prev) => prev.map((it, i) => i === itemIdx ? { ...it, amount: value } : it));
      window.dispatchEvent(new CustomEvent('order-changed'));
    } catch {
      setError('Ошибка изменения количества');
    }
  };

  const handleScanBarcode = async () => {
    if (!addBarcode.trim()) return;
    try {
      const catItem = await getCatalogItem(API_URL, addBarcode.trim());
      const existing = pendingItems.find((p) => p.barcode === addBarcode.trim());
      if (existing) {
        setPendingItems((prev) =>
          prev.map((p) =>
            p.barcode === addBarcode.trim() ? { ...p, amount: p.amount + 1 } : p
          )
        );
      } else {
        setPendingItems((prev) => [
          ...prev,
          { id: catItem.item_id, name: catItem.name, barcode: addBarcode.trim(), amount: 1 },
        ]);
      }
      setAddBarcode('');
    } catch {
      setError('Товар с таким штрихкодом не найден');
    }
  };

  const handlePendingAmountChange = (barcode: string, amount: number) => {
    setPendingItems((prev) =>
      prev.map((p) => (p.barcode === barcode ? { ...p, amount: Math.max(1, amount) } : p))
    );
  };

  const handleRemovePending = (barcode: string) => {
    setPendingItems((prev) => prev.filter((p) => p.barcode !== barcode));
  };

  const handleConfirmAddItems = async () => {
    if (pendingItems.length === 0) return;
    try {
      await appendItems(
        API_URL,
        orderId,
        pendingItems.map((p) => ({ add_id: p.id, add_amount: p.amount }))
      );
      const newItems: OrderItem[] = pendingItems.map((p) => ({
        name: p.name,
        amount: p.amount,
        price: 0,
      }));
      setItems((prev) => [...prev, ...newItems]);
      setAddDialogOpen(false);
      setPendingItems([]);
      setAddBarcode('');
      window.dispatchEvent(new CustomEvent('order-changed'));
    } catch {
      setError('Ошибка добавления товаров');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !order) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <IconButton onClick={() => navigate('/orders')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Заказ №{order?.number} (ID: {orderId})
        </Typography>
        <IconButton onClick={() => window.print()} title="Печать">
          <PrintIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Box className="no-print">
        <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Основные данные
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Получатель"
                fullWidth
                size="small"
                defaultValue={order?.poluchatel}
                onChange={(e) => handleFieldChange('poluchatel', e.target.value)}
              />
            </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Телефон"
              fullWidth
              size="small"
              defaultValue={order?.mobtelefon}
              onChange={(e) => handleFieldChange('mobtelefon', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="E-mail"
              fullWidth
              size="small"
              defaultValue={order?.email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
            />
          </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Комментарий"
                fullWidth
                size="small"
                multiline
                rows={2}
                defaultValue={order?.comment}
                onChange={(e) => handleFieldChange('comment', e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Статус заказа</InputLabel>
                <Select
                  defaultValue={order?.status_id ?? ''}
                  label="Статус заказа"
                  onChange={(e) =>
                    handleFieldChange('status_id', e.target.value)
                  }
                >
                  {refData?.o_statuses &&
                    Object.entries(refData.o_statuses).map(([k, v]) => (
                      <MenuItem key={k} value={Number(k)}>
                        {v}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth size="small">
              <InputLabel>Способ получения</InputLabel>
              <Select
                defaultValue={order?.delivery_id ?? ''}
                label="Способ получения"
                  onChange={(e) =>
                    handleFieldChange('delivery_id', e.target.value)
                  }
                >
                  {refData?.d_methods &&
                    Object.entries(refData.d_methods).map(([k, v]) => (
                      <MenuItem key={k} value={Number(k)}>
                        {v}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Способ оплаты"
                value={
                  order?.payment_id && refData?.p_methods
                    ? refData.p_methods[order.payment_id] ?? `ID ${order.payment_id}`
                    : ''
                }
                slotProps={{ input: { readOnly: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Статус оплаты</InputLabel>
                <Select
                  defaultValue={order?.payment_status_id ?? ''}
                  label="Статус оплаты"
                  onChange={(e) =>
                    handleFieldChange('payment_status_id', e.target.value)
                  }
                >
                  {refData?.p_statuses &&
                    Object.entries(refData.p_statuses).map(([k, v]) => (
                      <MenuItem key={k} value={Number(k)}>
                        {v}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || Object.keys(editedFields).length === 0}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<SendToMobileIcon />}
              onClick={handleSendMax}
              disabled={maxSending || maxSent}
            >
              {maxSending ? 'Отправка...' : maxSent ? 'Отправлено' : 'Уведомить в MAX'}
            </Button>
          </Box>
        </Paper>
      </Box>

      <Box className="print-only" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>Основные данные</Typography>
        <Typography>Заказ №{order?.number} (ID: {orderId})</Typography>
        <Typography>Получатель: {order?.poluchatel || '—'}</Typography>
        <Typography>Телефон: {order?.mobtelefon || '—'}</Typography>
        <Typography>E-mail: {order?.email || '—'}</Typography>
        <Typography>Статус заказа: {refData?.o_statuses[order?.status_id ?? -1] || '—'}</Typography>
        <Typography>Способ получения: {refData?.d_methods[order?.delivery_id ?? -1] || '—'}</Typography>
        <Typography>Способ оплаты: {refData?.p_methods[order?.payment_id ?? -1] || '—'}</Typography>
        <Typography>Статус оплаты: {refData?.p_statuses[order?.payment_status_id ?? -1] || '—'}</Typography>
        <Typography>Комментарий: {order?.comment || '—'}</Typography>
      </Box>

        <Paper elevation={2} sx={{ p: { xs: 1, sm: 2, md: 3 }, mb: 3 }}>
          <Box className="no-print"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              mb: 2,
            }}
          >
            <Typography variant="h6">Товары в заказе</Typography>
            <Button variant="contained" size="small" onClick={() => setAddDialogOpen(true)}>
              Добавить товар
            </Button>
          </Box>
          <Typography variant="h6" className="print-only" sx={{ mb: 2 }}>Товары в заказе</Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Артикул</TableCell>
                  <TableCell>Штрихкод</TableCell>
                  <TableCell>Кол-во</TableCell>
                  <TableCell>Цена</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Вес</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Объем</TableCell>
                  <TableCell className="hide-print-col" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Остатки</TableCell>
                  <TableCell className="hide-print-col" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{item.artikul ?? '—'}</TableCell>
                    <TableCell><Barcode value={item.bar_code ?? ''} /></TableCell>
                    <TableCell>
                      <span className="no-print">
                        <TextField
                          type="number"
                          size="small"
                          value={item.amount}
                          sx={{ width: { xs: 55, sm: 70 } }}
                          slotProps={{ htmlInput: { min: 1 } }}
                          onChange={(e) =>
                            handleAmountChange(idx, item.id, Number(e.target.value))
                          }
                        />
                      </span>
                      <span className="print-only">{item.amount}</span>
                    </TableCell>
                    <TableCell>
                      {item.price.toLocaleString('ru-RU', {
                        style: 'currency',
                        currency: 'RUB',
                      })}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{item.weight ?? '—'}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{item.volume ?? '—'}</TableCell>
                    <TableCell className="hide-print-col" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {loadingStorage ? (
                      <CircularProgress size={16} />
                    ) : storageKeys.length > 0 && (
                      storageKeys.some((k) => item[k as keyof OrderItem] !== undefined) ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {storageKeys.map((key) => {
                            const label = STORAGE_LABELS[key];
                            const val = item[key as keyof OrderItem] as number | undefined;
                            if (val === undefined) return null;
                            return (
                              <Box
                                key={key}
                                title={label}
                                sx={{
                                  px: 0.6,
                                  py: 0.1,
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  bgcolor: val >= item.amount ? '#e8f5e9' : '#ffebee',
                                  color: val >= item.amount ? '#2e7d32' : '#c62828',
                                  border: '1px solid',
                                  borderColor: val >= item.amount ? '#a5d6a7' : '#ef9a9a',
                                }}
                              >
                                {label}: {val}
                              </Box>
                            );
                          })}
                        </Box>
                      ) : (
                        <InventoryIcon sx={{ opacity: 0.3, fontSize: 18 }} />
                      )
                    )}
                  </TableCell>
                  <TableCell className="hide-print-col no-print" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => handleRemoveItem(idx)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={100} align="center">
                    Нет товаров
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Заметки. Не видны покупателям
        </Typography>
        <TextField
          fullWidth
          size="small"
          multiline
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => saveNoteLocally(note)}
            disabled={noteSaving || note === savedNoteRef.current}
          >
            {noteSaving ? 'Сохранение...' : 'Сохранить заметку'}
          </Button>
          {noteTimer > 0 && (
            <Typography variant="caption" color="text.secondary">
              Автосохранение через {noteTimer}с
            </Typography>
          )}
          {noteSaving && noteTimer === 0 && (
            <Typography variant="caption" color="text.secondary">
              Сохранено
            </Typography>
          )}
        </Box>
      </Paper>

      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Добавить товары по штрихкоду</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Штрихкод"
                fullWidth
                size="small"
                value={addBarcode}
                onChange={(e) => setAddBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScanBarcode()}
                autoFocus
              />
              <Button variant="outlined" onClick={handleScanBarcode} disabled={!addBarcode.trim()}>
                Сканировать
              </Button>
            </Box>

            {pendingItems.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Товар</TableCell>
                      <TableCell>Кол-во</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingItems.map((p) => (
                      <TableRow key={p.barcode}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell sx={{ width: 100 }}>
                          <TextField
                            type="number"
                            size="small"
                            value={p.amount}
                            slotProps={{ htmlInput: { min: 1 } }}
                            sx={{ width: 70 }}
                            onChange={(e) =>
                              handlePendingAmountChange(p.barcode, Number(e.target.value))
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ width: 50 }}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemovePending(p.barcode)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddDialogOpen(false); setPendingItems([]); }}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmAddItems}
            disabled={pendingItems.length === 0}
          >
            Добавить ({pendingItems.length})
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
