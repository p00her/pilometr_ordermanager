import axios from 'axios';

export const API_URL = '/endpoint.php';
const API_KEY = '2c9cc956eedb2f75ecbbfc6b16a3b403d9d0e13f';

export async function checkAuth(): Promise<{ ok: boolean; name?: string }> {
  const res = await axios.post(
    API_URL,
    { key: API_KEY, mode: 'checkauth' },
    { params: { t: Date.now() } }
  );
  return res.data;
}

export async function login(login: string, password: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  const res = await axios.post(API_URL, { key: API_KEY, mode: 'login' }, {
    params: { login, password },
  });
  return res.data;
}

export async function logout(): Promise<void> {
  await axios.post(API_URL, { key: API_KEY, mode: 'logout' });
}
