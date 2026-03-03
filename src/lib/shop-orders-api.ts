"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { DeliveryMethod, ShopOrder, ShopOrderItem, ShopOrderStatus } from "@/types/shop";

interface ApiOrdersResponse {
  orders?: ShopOrder[];
  order?: ShopOrder;
  error?: string;
}

interface CreateOrderPayload {
  id: string;
  invoiceStars: number;
  promoCode?: string;
  totalStarsCents: number;
  deliveryFeeStarsCents: number;
  discountStarsCents: number;
  delivery: DeliveryMethod;
  address: string;
  customerName: string;
  phone: string;
  email?: string;
  comment: string;
  items: ShopOrderItem[];
}

interface UpdateOrderStatusPayload {
  orderId: string;
  status: ShopOrderStatus;
  note?: string;
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiOrdersResponse;
    return payload.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const fetchMyShopOrders = async (): Promise<{ orders: ShopOrder[]; error?: string }> => {
  try {
    const response = await fetch("/api/shop/orders", {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { orders: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as ApiOrdersResponse;
    return { orders: payload.orders ?? [] };
  } catch {
    return { orders: [], error: "Network error" };
  }
};

export const fetchShopOrderById = async (orderId: string): Promise<{ order: ShopOrder | null; error?: string }> => {
  const normalizedOrderId = orderId.trim().toUpperCase();

  if (!normalizedOrderId) {
    return { order: null, error: "Invalid order id" };
  }

  try {
    const response = await fetch(`/api/shop/orders/${encodeURIComponent(normalizedOrderId)}`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { order: null, error: await parseApiError(response) };
    }

    const payload = (await response.json()) as ApiOrdersResponse;
    return { order: payload.order ?? null };
  } catch {
    return { order: null, error: "Network error" };
  }
};

export const createShopOrder = async (payload: CreateOrderPayload): Promise<{ order: ShopOrder | null; error?: string }> => {
  const idempotencyKey = `order-create:${payload.id.trim().toUpperCase()}`;

  try {
    const response = await fetch("/api/shop/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { order: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as ApiOrdersResponse;
    return { order: data.order ?? null };
  } catch {
    return { order: null, error: "Network error" };
  }
};

export const markShopOrderPaymentFailed = async (payload: {
  orderId: string;
  providerStatus?: string;
  reason?: string;
}): Promise<{ order: ShopOrder | null; error?: string }> => {
  const idempotencyKey = `order-payment-failed:${payload.orderId.trim().toUpperCase()}`;

  try {
    const response = await fetch(`/api/shop/orders/${encodeURIComponent(payload.orderId)}/payment-failed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({
        providerStatus: payload.providerStatus,
        reason: payload.reason,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { order: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as ApiOrdersResponse;
    return { order: data.order ?? null };
  } catch {
    return { order: null, error: "Network error" };
  }
};

export const updateAdminOrderStatus = async ({
  orderId,
  status,
  note,
}: UpdateOrderStatusPayload): Promise<{ order: ShopOrder | null; error?: string }> => {
  try {
    const response = await fetch(`/api/shop/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ status, note }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { order: null, error: await parseApiError(response) };
    }

    const payload = (await response.json()) as ApiOrdersResponse;
    return { order: payload.order ?? null };
  } catch {
    return { order: null, error: "Network error" };
  }
};
