'use client';

import { useParams } from 'next/navigation';
import { OrderDetail } from '@/components/orders/order-detail';

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="p-2">
      <OrderDetail orderId={params?.id ?? ''} backHref="/admin/orders" backLabel="Back to orders" />
    </div>
  );
}
