import axios from 'axios';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const res = await axios.get<{ value: T; expires_at: number } | null>('/api/cache/' + encodeURIComponent(key));
  return res.data?.value ?? null;
}

export async function cacheSet(key: string, value: unknown, ttl?: number): Promise<void> {
  await axios.post('/api/cache/' + encodeURIComponent(key), { value, ttl });
}

export async function cacheClear(): Promise<void> {
  await axios.post('/api/cache/clear');
}
