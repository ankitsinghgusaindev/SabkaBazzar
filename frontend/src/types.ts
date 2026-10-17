export type Role = "customer" | "shopkeeper" | "admin";

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "packed"
  | "ready"
  | "completed"
  | "cancelled";

export interface Product {
  id: number;
  name: string;
  category: string;
  unit: string;
  list_price: string;
  price: string;            // price after discount, what the customer pays
  discount_percent: number;
  stock: number;
  in_stock: boolean;
  is_active?: boolean;
  rating_avg: number;
  rating_count: number;
}

export interface ShopPublic {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  delivery_radius_km: number;
  is_open: boolean;
  members_only: boolean;
  shop_rating: number;
  shop_rating_count: number;
  delivery_rating: number;
  delivery_rating_count: number;
}

export interface NearbyShop extends ShopPublic {
  distance_km: number;
  delivers_to_you: boolean;
  is_member: boolean;
}

export interface ShopDetail {
  shop: ShopPublic;
  categories: { name: string; products: Product[] }[];
}

export interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  unit_price: string;
  quantity: number;
}

export interface Order {
  id: number;
  shop_id: number;
  status: OrderStatus;
  fulfilment: "pickup" | "delivery";
  delivery_address: string | null;
  total: string;
  created_at: string;
  reviewed: boolean;
  items: OrderItem[];
}

export interface Dashboard {
  shop: { name: string; is_open: boolean };
  revenue_today: { revenue: string; orders: number };
  revenue_7d: { revenue: string; orders: number };
  revenue_all: { revenue: string; orders: number };
  cancel_rate: number;
  pending_orders: number;
  customers: number;
  shop_rating: { avg: number; count: number };
  delivery_rating: { avg: number; count: number };
}

export interface InventoryResponse {
  low_stock: string[];
  categories: { name: string; products: Product[] }[];
}
