'use client';

import { useRef, useState } from 'react';
import { toast } from '@/stores/toast-store';

/**
 * Product and category images.
 *
 * The resize happens here, in the browser, before anything is uploaded. A
 * kitchen photo off a phone is several megabytes and four thousand pixels
 * wide; the POS grid shows it at about 160. Shipping the original would mean a
 * till on a store's wifi downloading fifty of them, which is exactly the
 * "images must not hurt POS performance" §5 warns about.
 *
 * WebP at 512px and quality 0.82 lands a typical drink photo around 30–60 KB,
 * which is small enough that fifty of them cost less than one original.
 *
 * Frontend-only build: there's no server to upload to, so the resized image
 * is kept as a data: URL and stored directly on the record — IndexedDB has
 * plenty of headroom for a few dozen 30–60 KB images, and it means a product
 * photo survives exactly as long as the rest of the demo data does.
 */

const MAX_EDGE = 512;
const QUALITY = 0.82;

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot resize images.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
  // Safari has historically refused WebP here; PNG is larger but always works,
  // and the server accepts either.
  if (blob) return blob;
  const fallback = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!fallback) throw new Error('Could not process that image.');
  return fallback;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}

export function ImageField({
  value,
  onChange,
  label = 'Image',
  hint,
  shape = 'square',
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  shape?: 'square' | 'wide';
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const blob = await shrink(file);
      const url = await toDataUrl(blob);
      onChange(url);
      toast.success('Image added');
    } catch (error) {
      toast.error('Could not process that image', (error as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      <div className="flex items-start gap-3">
        <div
          className={`relative shrink-0 overflow-hidden rounded-md border border-line bg-sunk
            ${shape === 'square' ? 'h-20 w-20' : 'h-20 w-32'}`}
        >
          {value ? (
            // A plain img rather than next/image: these are user uploads of
            // unknown dimensions on a page that is already client-rendered, and
            // the optimiser buys nothing for a file we resized ourselves.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-faint">
              None
            </div>
          )}
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/80 text-[10px] text-muted">
              Processing…
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="h-9 rounded border border-line bg-surface px-3 text-[13px] font-semibold
                hover:bg-sunk disabled:opacity-50"
            >
              {value ? 'Replace' : 'Upload'}
            </button>
            {value ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange(null)}
                className="h-9 rounded px-2 text-[13px] font-semibold text-muted hover:bg-sunk hover:text-ink"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-faint">
            {hint ?? 'PNG, JPEG or WebP. Resized to 512 px on this device before it is saved.'}
          </p>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) void pick(file); }}
      />
    </div>
  );
}
