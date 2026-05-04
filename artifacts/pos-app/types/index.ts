export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  colorHex: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  createdAt: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  paymentMethod: string;
  items?: SaleItem[];
}

export const VAT_RATE = 0.2;

export const CATEGORIES = ["All", "Beverages", "Food", "Snacks", "Desserts"];

export const PRODUCT_COLORS = [
  "#4F8EF7",
  "#6C63FF",
  "#2ECC71",
  "#F39C12",
  "#E74C3C",
  "#1ABC9C",
  "#9B59B6",
  "#E67E22",
];

export const SEED_PRODUCTS: Product[] = [
  { id: "p1", name: "Espresso", category: "Beverages", price: 2.5, description: "Single shot espresso", colorHex: "#E74C3C" },
  { id: "p2", name: "Cappuccino", category: "Beverages", price: 3.5, description: "Espresso with milk foam", colorHex: "#E67E22" },
  { id: "p3", name: "Latte", category: "Beverages", price: 4.0, description: "Espresso with steamed milk", colorHex: "#F39C12" },
  { id: "p4", name: "Americano", category: "Beverages", price: 3.0, description: "Espresso with hot water", colorHex: "#8E44AD" },
  { id: "p5", name: "Green Tea", category: "Beverages", price: 2.0, description: "Japanese green tea", colorHex: "#2ECC71" },
  { id: "p6", name: "Orange Juice", category: "Beverages", price: 3.5, description: "Fresh squeezed", colorHex: "#F39C12" },
  { id: "p7", name: "Club Sandwich", category: "Food", price: 7.5, description: "Triple decker sandwich", colorHex: "#4F8EF7" },
  { id: "p8", name: "Caesar Salad", category: "Food", price: 8.0, description: "Classic caesar salad", colorHex: "#1ABC9C" },
  { id: "p9", name: "Margherita Pizza", category: "Food", price: 12.0, description: "Classic pizza", colorHex: "#E74C3C" },
  { id: "p10", name: "Pasta Bolognese", category: "Food", price: 11.5, description: "Pasta with meat sauce", colorHex: "#E67E22" },
  { id: "p11", name: "Chips", category: "Snacks", price: 1.5, description: "Salted potato chips", colorHex: "#F1C40F" },
  { id: "p12", name: "Cookies", category: "Snacks", price: 2.0, description: "Chocolate chip cookies", colorHex: "#8E44AD" },
  { id: "p13", name: "Nachos", category: "Snacks", price: 3.5, description: "Nachos with salsa", colorHex: "#E67E22" },
  { id: "p14", name: "Pretzel", category: "Snacks", price: 2.5, description: "Warm soft pretzel", colorHex: "#4F8EF7" },
  { id: "p15", name: "Chocolate Cake", category: "Desserts", price: 5.0, description: "Rich chocolate cake", colorHex: "#9B59B6" },
  { id: "p16", name: "Cheesecake", category: "Desserts", price: 5.5, description: "New York cheesecake", colorHex: "#4F8EF7" },
  { id: "p17", name: "Ice Cream", category: "Desserts", price: 3.5, description: "Two scoops", colorHex: "#E74C3C" },
  { id: "p18", name: "Brownie", category: "Desserts", price: 3.0, description: "Warm fudge brownie", colorHex: "#6C63FF" },
];
