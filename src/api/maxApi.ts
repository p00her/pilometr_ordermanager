import axios from 'axios';

const API_URL = '/endpoint.php';
const API_KEY = '2c9cc956eedb2f75ecbbfc6b16a3b403d9d0e13f';

export type MaxNotifyType = 'new_order' | 'order_cancelled';

export interface MaxNotificationSettings {
  new_order: boolean;
  order_cancelled: boolean;
  delivery_ids: number[];
}

function buildParams(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

export async function registerChat(chatId: string, email?: string, settings?: Partial<MaxNotificationSettings>): Promise<{ ok: boolean }> {
  const params = { key: API_KEY, mode: 'register_chat', chat_id: chatId, email: email || '', settings: settings ? JSON.stringify(settings) : '' };
  const res = await axios.get(`${API_URL}?${buildParams(params)}`);
  return res.data;
}

export async function sendMaxNotification(orderId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await axios.get(`${API_URL}?${buildParams({ key: API_KEY, mode: 'send_max_notification', order_id: orderId })}`);
  return res.data;
}

export async function getMaxSettings(): Promise<{ ok: boolean; settings?: MaxNotificationSettings; d_methods?: Record<string, string> }> {
  const res = await axios.get(`${API_URL}?${buildParams({ key: API_KEY, mode: 'get_max_settings' })}`);
  return res.data;
}

export async function updateMaxSettings(settings: MaxNotificationSettings): Promise<{ ok: boolean }> {
  const res = await axios.get(`${API_URL}?${buildParams({ key: API_KEY, mode: 'update_max_settings', settings: JSON.stringify(settings) })}`);
  return res.data;
}

export async function autoNotify(): Promise<{ ok: boolean; sent: number; total: number }> {
  const res = await axios.get(`${API_URL}?${buildParams({ key: API_KEY, mode: 'auto_notify' })}`);
  return res.data;
}

export async function unregisterChat(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await axios.get(`${API_URL}?${buildParams({ key: API_KEY, mode: 'unregister_chat', chat_id: chatId })}`);
  return res.data;
}

export async function checkChatRegistered(chatId: string): Promise<{ ok: boolean; registered: boolean; email?: string }> {
  const res = await axios.get(`${API_URL}?${buildParams({ key: API_KEY, mode: 'check_chat_registered', chat_id: chatId })}`);
  return res.data;
}
