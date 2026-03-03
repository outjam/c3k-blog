interface OrderCardItemInput {
  title: string;
  quantity: number;
}

interface BuildOrderCardSvgInput {
  orderId: string;
  amountStars: number;
  items: OrderCardItemInput[];
  appTitle?: string;
}

const MAX_ITEMS = 7;

const escapeXml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

const formatAmount = (value: number): string => {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(value)));
};

const truncate = (value: string, max = 48): string => {
  const normalized = value.trim();

  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
};

export const buildOrderCardSvg = ({
  orderId,
  amountStars,
  items,
  appTitle = "C3K Store",
}: BuildOrderCardSvgInput): string => {
  const normalizedItems = items
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      title: truncate(item.title || "Товар"),
      quantity: Math.max(1, Math.min(99, Math.round(item.quantity || 1))),
    }));

  const hiddenCount = Math.max(items.length - normalizedItems.length, 0);
  const listRows = normalizedItems
    .map((item, index) => {
      const y = 360 + index * 78;

      return `
      <g transform="translate(72, ${y})">
        <circle cx="12" cy="16" r="6" fill="#B08BFF" />
        <text x="36" y="22" fill="#F4F6FF" font-size="28" font-family="Arial, sans-serif">${escapeXml(item.title)}</text>
        <text x="922" y="22" text-anchor="end" fill="#B6BBCE" font-size="26" font-family="Arial, sans-serif">×${item.quantity}</text>
      </g>`;
    })
    .join("");

  const hiddenRow =
    hiddenCount > 0
      ? `
      <g transform="translate(72, ${360 + normalizedItems.length * 78})">
        <text x="36" y="22" fill="#8C93AB" font-size="24" font-family="Arial, sans-serif">и ещё ${hiddenCount} товар(ов)</text>
      </g>`
      : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1280" viewBox="0 0 1080 1280">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#131728" />
      <stop offset="52%" stop-color="#1B2035" />
      <stop offset="100%" stop-color="#101424" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#66B7FF" />
      <stop offset="100%" stop-color="#B08BFF" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1080" height="1280" fill="url(#bg)" />
  <circle cx="980" cy="120" r="220" fill="#3E3E7D" opacity="0.25" />
  <circle cx="90" cy="1160" r="260" fill="#274A70" opacity="0.20" />

  <rect x="48" y="48" width="984" height="1184" rx="48" fill="#0E1222" opacity="0.62" />
  <rect x="48" y="48" width="984" height="1184" rx="48" fill="none" stroke="#2A2F48" stroke-width="2" />

  <text x="72" y="122" fill="#8C93AB" font-size="28" font-family="Arial, sans-serif">${escapeXml(appTitle)}</text>
  <text x="72" y="184" fill="#F8FAFF" font-size="56" font-family="Arial, sans-serif" font-weight="700">Заказ № ${escapeXml(orderId)}</text>
  <text x="72" y="232" fill="#8C93AB" font-size="28" font-family="Arial, sans-serif">Оплата получена</text>

  <rect x="72" y="266" width="936" height="2" fill="#2A2F48" />

  <text x="72" y="326" fill="#B6BBCE" font-size="28" font-family="Arial, sans-serif">Состав заказа</text>

  ${listRows}
  ${hiddenRow}

  <rect x="72" y="1020" width="936" height="2" fill="#2A2F48" />
  <text x="72" y="1096" fill="#B6BBCE" font-size="30" font-family="Arial, sans-serif">Сумма</text>
  <text x="922" y="1098" text-anchor="end" fill="url(#accent)" font-size="48" font-family="Arial, sans-serif" font-weight="700">${formatAmount(
    amountStars,
  )} ⭐</text>
</svg>`.trim();
};

