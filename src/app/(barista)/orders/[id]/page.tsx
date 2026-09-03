'use client';

import { useParams } from 'next/navigation';
import { OrderDetail } from '@/components/orders/order-detail';

export default function BaristaOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return <OrderDetail orderId={params?.id ?? ''} backHref="/orders" backLabel="Back to the board" />;
}
