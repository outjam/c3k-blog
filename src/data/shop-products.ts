import type { ShopCategory, ShopProduct, ShopProductCategory } from "@/types/shop";

const CATEGORY_META: Array<{ key: ShopCategory; label: string; emoji: string; tone: [string, string] }> = [
  { key: "figurine", label: "Фигурки", emoji: "🗿", tone: ["#f8c38f", "#d99a68"] },
  { key: "vase", label: "Вазы", emoji: "🏺", tone: ["#e8b58f", "#be8156"] },
  { key: "mug", label: "Кружки", emoji: "☕", tone: ["#f5d2b2", "#c58b61"] },
  { key: "lamp", label: "Светильники", emoji: "🕯️", tone: ["#e6c8a4", "#b5794d"] },
  { key: "plate", label: "Тарелки", emoji: "🍽️", tone: ["#eecaa8", "#c3875a"] },
];

const COLLECTIONS = ["Terra Nova", "Claycraft", "Nordic Dust", "Studio 26", "Warm Earth"];
const TECHNIQUES = ["Ручная лепка", "Гончарный круг", "Шликерное литье", "Фактурная резьба", "Двойной обжиг"];
const COLORS = ["Песочный", "Графит", "Терракота", "Молочный", "Оливковый"];

const toDataUri = (content: string): string => {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
};

const createProductArt = (emoji: string, title: string, toneA: string, toneB: string): string => {
  return toDataUri(`
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480' viewBox='0 0 640 480'>
  <defs>
    <linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'>
      <stop offset='0%' stop-color='${toneA}'/>
      <stop offset='100%' stop-color='${toneB}'/>
    </linearGradient>
  </defs>
  <rect width='640' height='480' fill='url(#g)' rx='28'/>
  <circle cx='510' cy='86' r='90' fill='rgba(255,255,255,0.12)'/>
  <circle cx='110' cy='420' r='140' fill='rgba(0,0,0,0.08)'/>
  <text x='36' y='72' fill='rgba(20,16,12,0.7)' font-family='Arial, sans-serif' font-size='34' font-weight='700'>Clay Fake Market</text>
  <text x='36' y='126' fill='rgba(20,16,12,0.68)' font-family='Arial, sans-serif' font-size='26'>${title}</text>
  <text x='320' y='300' text-anchor='middle' font-size='150'>${emoji}</text>
</svg>`);
};

const generateProduct = (index: number): ShopProduct => {
  const categoryMeta = CATEGORY_META[index % CATEGORY_META.length];
  const sequence = index + 1;
  const collection = COLLECTIONS[index % COLLECTIONS.length] ?? COLLECTIONS[0];
  const technique = TECHNIQUES[index % TECHNIQUES.length] ?? TECHNIQUES[0];
  const color = COLORS[index % COLORS.length] ?? COLORS[0];
  const priceStarsCents = index % 2 === 0 ? 1 : 2;
  const oldPriceStarsCents = index % 4 === 0 ? 2 : undefined;
  const stock = 3 + ((index * 5) % 18);
  const rating = Number((4.2 + ((index * 7) % 9) / 10).toFixed(1));
  const reviewsCount = 12 + ((index * 31) % 280);

  const title = `${categoryMeta.label.slice(0, -1)} из глины №${sequence}`;
  const subtitle = `${collection} • ${technique}`;
  const description = `Декоративное изделие ручной работы. Серия ${collection}, цвет ${color}. Подходит для интерьера, фотосессий и подарков.`;

  return {
    id: `clay-${sequence}`,
    slug: `clay-product-${sequence}`,
    title,
    subtitle,
    description,
    category: categoryMeta.key,
    image: createProductArt(categoryMeta.emoji, title, categoryMeta.tone[0], categoryMeta.tone[1]),
    priceStarsCents,
    oldPriceStarsCents,
    rating,
    reviewsCount,
    isNew: index < 10,
    isHit: index % 6 === 0,
    tags: [categoryMeta.label, collection, color],
    attributes: {
      material: "Красная глина",
      technique,
      color,
      heightCm: 10 + (index % 9) * 2,
      widthCm: 8 + (index % 7) * 2,
      weightGr: 220 + (index % 12) * 35,
      collection,
      sku: `CLY-${String(sequence).padStart(4, "0")}`,
      stock,
    },
  };
};

export const SHOP_PRODUCTS: ShopProduct[] = Array.from({ length: 50 }, (_, index) => generateProduct(index));

export const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  figurine: "Фигурки",
  vase: "Вазы",
  mug: "Кружки",
  lamp: "Светильники",
  plate: "Тарелки",
};

export const SHOP_DEFAULT_PRODUCT_CATEGORIES: ShopProductCategory[] = [
  {
    id: "figurine",
    label: "Фигурки",
    emoji: "🗿",
    description: "Декоративные статуэтки и мини-скульптуры",
    order: 10,
    subcategories: [
      { id: "collectible", label: "Коллекционные", order: 10 },
      { id: "minimal", label: "Минимализм", order: 20 },
      { id: "fantasy", label: "Фэнтези", order: 30 },
    ],
  },
  {
    id: "vase",
    label: "Вазы",
    emoji: "🏺",
    description: "Настольные, интерьерные и декоративные вазы",
    order: 20,
    subcategories: [
      { id: "table", label: "Настольные", order: 10 },
      { id: "floor", label: "Напольные", order: 20 },
      { id: "decorative", label: "Декор", order: 30 },
    ],
  },
  {
    id: "mug",
    label: "Кружки",
    emoji: "☕",
    description: "Кружки для кофе, чая и авторские наборы",
    order: 30,
    subcategories: [
      { id: "coffee", label: "Кофейные", order: 10 },
      { id: "tea", label: "Чайные", order: 20 },
      { id: "gift", label: "Подарочные", order: 30 },
    ],
  },
  {
    id: "lamp",
    label: "Светильники",
    emoji: "🕯️",
    description: "Настольные и интерьерные источники света",
    order: 40,
    subcategories: [
      { id: "table-lamp", label: "Настольные", order: 10 },
      { id: "night", label: "Ночники", order: 20 },
      { id: "ambient", label: "Атмосферные", order: 30 },
    ],
  },
  {
    id: "plate",
    label: "Тарелки",
    emoji: "🍽️",
    description: "Подача, сервировка и декоративные блюда",
    order: 50,
    subcategories: [
      { id: "serving", label: "Сервировочные", order: 10 },
      { id: "dessert", label: "Десертные", order: 20 },
      { id: "decorative", label: "Декор", order: 30 },
    ],
  },
];

export const getShopProductBySlug = (slug: string): ShopProduct | undefined => {
  return SHOP_PRODUCTS.find((product) => product.slug === slug);
};
