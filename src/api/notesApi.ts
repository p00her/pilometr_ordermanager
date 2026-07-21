import axios from 'axios';

export async function getNote(orderId: number): Promise<string> {
  const res = await axios.get<{ note: string; updated_at: number }>('/api/notes/' + orderId);
  return res.data.note ?? '';
}

export async function saveNote(orderId: number, note: string): Promise<void> {
  await axios.post('/api/notes/' + orderId, { note });
}
