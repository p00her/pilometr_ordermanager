import axios from 'axios';
import type {
  Order,
  OrderDetail,
  StatsResponse,
  ReferenceData,
  CatalogItem,
} from '../types';

export const API_URL = '/endpoint.php';
const API_KEY = '2c9cc956eedb2f75ecbbfc6b16a3b403d9d0e13f';

function buildPhpQuery(obj: Record<string, unknown>, prefix = ''): string[] {
  const pairs: string[] = [];
  Object.entries(obj).forEach(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const ikey = `${key}[${i}]`;
        if (typeof item === 'object' && item !== null) {
          pairs.push(...buildPhpQuery(item as Record<string, unknown>, ikey));
        } else {
          pairs.push(`${encodeURIComponent(ikey)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof v === 'object' && v !== null) {
      pairs.push(...buildPhpQuery(v as Record<string, unknown>, key));
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  });
  return pairs;
}

async function apiPost<T>(
  endpoint: string,
  jsonBody: Record<string, unknown>,
  queryParams: Record<string, unknown> = {}
): Promise<T> {
  const allParams = { ...jsonBody, ...queryParams };
  const parts = buildPhpQuery(allParams);
  const qs = parts.join('&');
  const url = qs ? `${endpoint}?${qs}` : endpoint;
  const res = await axios.get<T>(url);
  return res.data;
}

export async function getCachedOrders(since?: string): Promise<{ data: Order[]; lastSyncTime: string }> {
  const url = since ? `/api/orders?since=${encodeURIComponent(since)}` : '/api/orders';
  const res = await axios.get<{ data: Order[]; lastSyncTime: string }>(url);
  return res.data;
}

export async function triggerSync(): Promise<void> {
  await axios.post('/api/orders/sync');
}

export async function triggerFullSync(clear = false): Promise<void> {
  await axios.post(`/api/orders/full-sync?clear=${clear ? '1' : '0'}`);
}

export async function getOrderDetail(
  endpoint: string,
  orderId: number
): Promise<OrderDetail> {
  return apiPost<OrderDetail>(endpoint, {
    key: API_KEY,
    mode: 'getdata',
    order_id: orderId,
  });
}

export async function getItemStorage(
  endpoint: string,
  itemIds: number[]
): Promise<{ id: number; volhov_storage?: number; lomonosov_storage?: number; roshino_storage?: number; skotnoe_storage?: number; ladoga_storage?: number }[]> {
  return apiPost(
    endpoint,
    { key: API_KEY, mode: 'getitemstorage' },
    { item_ids: itemIds },
  );
}

export async function updateOrder(
  endpoint: string,
  orderId: number,
  data: Record<string, unknown>
): Promise<void> {
  return apiPost<void>(
    endpoint,
    { key: API_KEY, mode: 'putdata', order_id: orderId },
    data
  );
}

export async function setOrderStatus(
  endpoint: string,
  orderId: number,
  statusId: number
): Promise<void> {
  return apiPost<void>(endpoint, {
    key: API_KEY,
    mode: 'setstatus',
    order_id: orderId,
    status_id: statusId,
  });
}

export async function getStats(
  endpoint: string,
  dateFrom: string,
  dateTo: string,
  start = 0,
  length = 10000
): Promise<StatsResponse> {
  return apiPost<StatsResponse>(
    endpoint,
    { key: API_KEY, mode: 'getstat' },
    { date_from: dateFrom, date_to: dateTo, start, length }
  );
}

export async function getCatalogItem(
  endpoint: string,
  barcode: string
): Promise<CatalogItem> {
  return apiPost<CatalogItem>(
    endpoint,
    { key: API_KEY, mode: 'getcatalogitem' },
    { barcode }
  );
}

export async function getReferenceData(endpoint: string): Promise<ReferenceData> {
  return apiPost<ReferenceData>(endpoint, {
    key: API_KEY,
    mode: 'getallnames4statuses',
  });
}

export async function removeOrderItem(
  endpoint: string,
  orderId: number,
  itemId: number
): Promise<void> {
  return apiPost<void>(
    endpoint,
    { key: API_KEY, mode: 'removeitem', order_id: orderId },
    { item_id: itemId }
  );
}

export async function setItemAmount(
  endpoint: string,
  orderId: number,
  items: { id: number; value: number }[]
): Promise<void> {
  return apiPost<void>(
    endpoint,
    { key: API_KEY, mode: 'setamount', order_id: orderId },
    { items }
  );
}

export async function appendItems(
  endpoint: string,
  orderId: number,
  items: { add_id: number; add_amount: number }[]
): Promise<void> {
  return apiPost<void>(
    endpoint,
    { key: API_KEY, mode: 'appenditems', order_id: orderId },
    { append_items: items }
  );
}
