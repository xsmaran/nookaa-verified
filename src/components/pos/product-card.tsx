'use client';

import { formatMoney } from '@/lib/format';
import type { PosProduct, Product, UnavailableReason } from '@/types';

const TEMP_LABEL: Record<Product['temp'], string> = {
  HOT: 'Hot · 250',
  COLD: 'Cold · 475',
  BLENDED: 'Blended · 475',
  HOT_OR_COLD: 'Hot / Cold',
};

const BADGE_LABEL: Record<NonNullable<Product['badge']>, string> = {
  POPULAR: 'Popular',
  NEW: 'New',
  SIGNATURE: 'Signature',
};

/**
 * Why the tile is greyed out.
 *
 * Three different problems with three different fixes, so they get three
 * different words. "Unavailable" for all of them would send a barista to
 * check the fridge when the answer is that the office took it off the menu.
 */
const UNAVAILABLE_LABEL: Record<UnavailableReason, string> = {
  ADMIN: 'Off the menu',
  STORE: 'Unavailable here',
  OUT_OF_STOCK: 'Out of stock',
};

/**
 * A product tile.
 *
 * Text-first, with the image supporting it rather than the other way round: at
 * arm's length on a busy bar the spec line ("Iced Latte") is what a barista
 * matches against. The photograph helps a new starter and helps a customer
 * pointing at the screen, so it earns its place — but it is a band across the
 * top, not the whole card, and the tile still reads fine without one.
 */
export function ProductCard({
  product,
  unavailable,
  reason,
  showImage = true,
  onSelect,
}: {
  product: PosProduct | Product;
  unavailable?: boolean;
  reason?: UnavailableReason | null;
  showImage?: boolean;
  onSelect: (product: Product) => void;
}) {
  const imageUrl = 'imageUrl' in product ? product.imageUrl : null;

  return (
    <button
      onClick={() => onSelect(product)}
      disabled={unavailable}
      title={unavailable && reason ? UNAVAILABLE_LABEL[reason] : undefined}
      className={`group relative flex h-full flex-col overflow-hidden rounded-md border text-left transition-colors
        ${unavailable ? 'cursor-not-allowed border-line bg-sunk' : 'border-line bg-surface hover:border-ink'}`}
    >
      {showImage ? (
        <div className={`relative h-20 w-full shrink-0 overflow-hidden border-b border-line bg-sunk
          ${unavailable ? 'opacity-40' : ''}`}>
          {imageUrl ? (
            // A plain img: these are our own resized WebP files at a known
            // size, and next/image would add a request and a layout pass for
            // nothing on a grid that has to stay instant.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            // The placeholder is the drink's own initials rather than a broken
            // image icon — a grid of identical grey squares is worse than no
            // images at all.
            <span className="flex h-full w-full items-center justify-center font-display text-xl tracking-wide text-faint/70">
              {initials(product.spec)}
            </span>
          )}

          {product.badge ? (
            <span className="absolute left-1.5 top-1.5 rounded-sm bg-gold-soft px-1.5 py-0.5
              text-[9px] font-bold uppercase tracking-wider text-gold-deep">
              {BADGE_LABEL[product.badge]}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-[76px] flex-1 flex-col justify-between p-2.5">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[13px] font-bold uppercase leading-tight tracking-wide
              ${unavailable ? 'text-faint' : 'text-ink'}`}>
              {product.spec}
            </p>
            {!showImage && product.badge ? (
              <span className="shrink-0 rounded-sm bg-gold-soft px-1.5 py-0.5 text-[9px] font-bold
                uppercase tracking-wider text-gold-deep">
                {BADGE_LABEL[product.badge]}
              </span>
            ) : null}
          </div>
          <p className={`mt-0.5 truncate font-display text-[13px] italic leading-tight
            ${unavailable ? 'text-faint' : 'text-muted'}`}>
            {product.name}
          </p>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <span className={`truncate text-[10px] font-semibold uppercase tracking-wider
            ${unavailable ? 'text-status-alert' : 'text-faint'}`}>
            {unavailable ? UNAVAILABLE_LABEL[reason ?? 'OUT_OF_STOCK'] : TEMP_LABEL[product.temp]}
          </span>
          <span className={`tnum shrink-0 font-mono text-sm font-bold ${unavailable ? 'text-faint' : 'text-ink'}`}>
            {formatMoney(product.priceMinor, false)}
          </span>
        </div>
      </div>
    </button>
  );
}

/** "Iced Latte" → "IL". Enough to tell tiles apart without a photograph. */
function initials(spec: string): string {
  return spec
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
