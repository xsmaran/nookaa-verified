/**
 * Identifier generation.
 *
 * Two id spaces exist and they are never mixed up:
 *  - UUID       — globally unique, generated on device, survives sync as-is.
 *  - orderNumber— human readable, printed, spoken across a counter. It embeds
 *                 store + date + device so two offline devices in the same
 *                 store can never mint the same string.
 */

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Deterministic-enough fallback for older POS browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford-ish, no I/L/O/U

function randomBlock(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
}

export function yymmdd(d: Date = new Date()): string {
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** NK-MUM01-260826-0042 */
export function buildOrderNumber(storeCode: string, sequence: number, at: Date = new Date()): string {
  return `NK-${storeCode}-${yymmdd(at)}-${String(sequence).padStart(4, '0')}`;
}

/** CUP-8F4A91 — short enough to read aloud, long enough not to collide. */
export function buildCupId(): string {
  return `CUP-${randomBlock(6)}`;
}

/**
 * Opaque cup token. In production the backend signs this (HMAC) so a scanner
 * can verify it without a round trip and a photographed QR cannot be forged.
 * MOCK: a random block stands in for the signature.
 */
export function buildCupToken(cupId: string): string {
  return `${cupId}.${randomBlock(16)}`;
}

export function cupUri(token: string): string {
  return `nookaa://cup/${token}`;
}

/**
 * A 4-digit pickup code — issued only for app orders, alongside the cup's own
 * QR. The cup label's QR is meant for a barista who is already holding the
 * cup; this is the other direction, something a customer who placed the order
 * remotely can read aloud or type in themselves at the counter.
 */
export function buildPickupCode(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b % 10).join('');
}

export function parseCupScan(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withoutScheme = value.replace(/^nookaa:\/\/cup\//i, '');
  const cupId = withoutScheme.split('.')[0].toUpperCase();
  return /^CUP-[0-9A-Z]{6}$/.test(cupId) ? cupId : null;
}

/** INV/NK/2627/000431 — invoice numbers are gapless and never reused. */
export function buildInvoiceNumber(prefix: string, fyLabel: string, sequence: number): string {
  return `${prefix}/${fyLabel}/${String(sequence).padStart(6, '0')}`;
}

/**
 * The customer-facing bill page — what actually gets sent, not a PDF. Whoever
 * opens it can view the bill and download or share it from there.
 */
export function billUrl(invoiceId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/bill/${invoiceId}`;
}
