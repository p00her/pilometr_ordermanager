export interface OrderItem {
  id?: number;
  name: string;
  amount: number;
  price: number;
  bar_code?: string;
  artikul?: string;
  volume?: number;
  width?: number;
  height?: number;
  length?: number;
  weight?: number;
  volhov_storage?: number;
  lomonosov_storage?: number;
  roshino_storage?: number;
  skotnoe_storage?: number;
  ladoga_storage?: number;
}

export const STORAGE_LABELS: Record<string, string> = {
  volhov_storage: 'Волхов',
  lomonosov_storage: 'Марьино',
  roshino_storage: 'Рощино',
  skotnoe_storage: 'Север',
  ladoga_storage: 'Ладога',
};

export interface Order {
  id: number;
  number: number;
  order_date: string;
  delivery_method?: string;
  delivery_id?: number;
  r_weight?: number;
  r_volume?: number;
  poluchatel?: string;
  mobtelefon?: string;
  email?: string;
  delivery_price?: number;
  delivery_aw_date?: string;
  price: number;
  address?: string;
  comment?: string;
  finish_point?: string;
  start_point?: string;
  order_status?: string;
  status_id?: number;
  delivery_status?: string;
  delivery_status_id?: number;
  payment_status?: string;
  payment_status_id?: number;
  payment_method?: string;
  payment_id?: number;
  items?: OrderItem[];
}

export interface StatsTotals {
  total: number;
  total_order_price: number;
  total_weight: number;
  total_volume: number;
}

export interface StatsByGroup {
  total: number;
  total_order_price: number;
  total_weight: number;
  total_volume: number;
  in_progress?: StatsTotals;
  ready?: StatsTotals;
  closed?: StatsTotals;
  cancelled?: StatsTotals;
}

export interface StatsResponse {
  recordsTotal: number;
  d_methods: Record<string, string>;
  by_delivery: Record<string, StatsByGroup>;
  total: StatsByGroup;
}

export interface OrdersListResponse {
  recordsTotal: number;
  recordsFiltered: number;
  draw: number;
  data: Order[];
  o_statuses: Record<number, string>;
  p_statuses: Record<number, string>;
  d_statuses: Record<number, string>;
  d_methods: Record<number, string>;
  p_methods: Record<number, string>;
}

export interface OrderDetail {
  number: number;
  status_id: number;
  payment_id: number;
  payment_status_id: number;
  delivery_id: number;
  poluchatel: string;
  mobtelefon: string;
  email?: string;
  comment: string;
  items?: OrderItem[];
}

export interface CatalogItem {
  name: string;
  item_id: number;
  volhov_storage?: number;
  lomonosov_storage?: number;
  roshino_storage?: number;
  skotnoe_storage?: number;
  ladoga_storage?: number;
}

export interface ReferenceData {
  o_statuses: Record<number, string>;
  d_methods: Record<number, string>;
  d_statuses: Record<number, string>;
  p_methods: Record<number, string>;
  p_statuses: Record<number, string>;
}
