'use client';

import { useCallback, useEffect, useState } from 'react';
import { OrderRepository } from '@/repositories';
import type { OrderQuery } from '@/repositories/order-repository';
import { bus, EVENTS } from '@/services';
import type { Order } from '@/types';

/**
 * Orders for a screen, kept fresh by the event bus rather than by polling.
 * One query, one subscription — a KDS left open all day must not accumulate
 * timers.
 */
export function useOrders(query: OrderQuery) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query);

  const load = useCallback(async () => {
    const result = await OrderRepository.query(JSON.parse(key) as OrderQuery);
    setOrders(result);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
    return bus.on(EVENTS.ORDERS_CHANGED, () => void load());
  }, [load]);

  return { orders, loading, reload: load };
}

export function useOrder(id: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const result = await OrderRepository.byId(id);
    setOrder(result ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
    return bus.on(EVENTS.ORDERS_CHANGED, () => void load());
  }, [load]);

  return { order, loading, reload: load };
}
