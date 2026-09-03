/** Money is stored in paise everywhere. Only this file turns it into text. */

export function formatMoney(minor: number, withSymbol = true): string {
  const rupees = minor / 100;
  const text = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `₹${text}` : text;
}

export function formatMoneyShort(minor: number): string {
  const rupees = minor / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${Math.round(rupees)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** mm:ss for anything under an hour, then h:mm:ss. Always tabular width. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function maskPhone(phone: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return phone;
  return `+91 ${digits.slice(0, 2)}XXX XX${digits.slice(-3)}`;
}

export function formatPhone(phone: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

/** A name is valid once it has at least one non-space character. */
export function isValidCustomerName(name: string): boolean {
  return name.trim().length > 0;
}

/** Accepts any phone with at least 10 digits — country code prefixes are fine. */
export function isValidCustomerPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 10;
}

export function formatQty(qty: number, unit: string): string {
  if (unit === 'pc') return `${Math.round(qty)} pc`;
  if (unit === 'g' && Math.abs(qty) >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
  if (unit === 'ml' && Math.abs(qty) >= 1000) return `${(qty / 1000).toFixed(2)} L`;
  return `${Number(qty.toFixed(1))} ${unit}`;
}
