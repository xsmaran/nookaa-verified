'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Field, FormActions, Notice, QuantityInput, RadioGroup, Select, Sheet, Textarea,
} from '@/components/ui';
import { formatBaseQty, purchaseUnitsFor, toBaseUnits } from '@/lib/units';
import { formatMoney } from '@/lib/format';
import { useSave } from '@/hooks/use-save';
import { InventoryService } from '@/services';
import { useSession } from '@/stores/session-store';
import type { Ingredient, InventoryLevel } from '@/types';

/**
 * Record a stock movement.
 *
 * Four things people actually do, and they are different enough to deserve
 * different words: stock arrived, stock was lost, the count was wrong, or we
 * have just counted it. Making them one "adjust quantity" box is how a store
 * ends up unable to tell shrinkage from bad data entry.
 *
 * The sign is applied by the type rather than typed. Nobody should have to
 * remember that waste is negative, and somebody who forgets would otherwise
 * add stock by spilling it.
 */

type MovementType = 'PURCHASE' | 'WASTE' | 'SPOILAGE' | 'ADJUSTMENT' | 'STOCK_COUNT';

const TYPES: Array<{ value: MovementType; label: string; hint: string }> = [
  { value: 'PURCHASE', label: 'Stock in', hint: 'A delivery arrived' },
  { value: 'WASTE', label: 'Waste', hint: 'Spilled, dropped, or thrown out' },
  { value: 'SPOILAGE', label: 'Spoilage', hint: 'Went off or expired' },
  { value: 'STOCK_COUNT', label: 'Stock count', hint: 'Sets the balance to what you counted' },
  { value: 'ADJUSTMENT', label: 'Correction', hint: 'Fixing a mistake in the ledger' },
];

const WASTE_REASONS = ['Spillage', 'Spoilage', 'Damaged', 'Expired', 'Training', 'Customer remake', 'Other'];

export function StockMovementSheet({
  open,
  storeId,
  ingredient,
  level,
  onClose,
  onSaved,
}: {
  open: boolean;
  storeId: string;
  ingredient: Ingredient | null;
  level: InventoryLevel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { save, saving, error, clearError } = useSave();
  const session = useSession((s) => s.session);

  const [type, setType] = useState<MovementType>('PURCHASE');
  const [qty, setQty] = useState<number | null>(null);
  const [unit, setUnit] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const units = useMemo(
    () => (ingredient ? purchaseUnitsFor(ingredient.unit) : []),
    [ingredient],
  );

  useEffect(() => {
    if (!open || !ingredient) return;
    setType('PURCHASE');
    setQty(null);
    // Default to the largest sensible unit: deliveries arrive in litres and
    // kilos, and making somebody type 20000 is how a zero goes missing.
    setUnit(units[units.length - 1]?.id ?? ingredient.unit);
    setReason('');
    setNote('');
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ingredient?.id]);

  if (!ingredient) return null;

  const baseQty = (() => {
    if (qty === null) return null;
    try { return toBaseUnits(Math.abs(qty), unit, ingredient.unit); } catch { return null; }
  })();

  const onHand = level?.onHand ?? 0;
  const projected = baseQty === null ? onHand
    : type === 'STOCK_COUNT' ? baseQty
    : type === 'PURCHASE' || type === 'ADJUSTMENT' ? onHand + baseQty
    : onHand - baseQty;

  const variance = type === 'STOCK_COUNT' && baseQty !== null ? baseQty - onHand : null;
  const needsReason = type === 'WASTE' || type === 'SPOILAGE';
  const valid = baseQty !== null && baseQty > 0 && (!needsReason || Boolean(reason));

  async function submit() {
    if (baseQty === null || !session) return;

    // The ledger takes a signed quantity in the ingredient's base unit.
    // Everything above this line is about not making a human do that arithmetic.
    const signed =
      type === 'WASTE' || type === 'SPOILAGE' ? -baseQty
      : type === 'ADJUSTMENT' && (qty ?? 0) < 0 ? -baseQty
      : baseQty;

    const result = await save(
      () => InventoryService.record({
        storeId,
        deviceId: session.deviceId,
        ingredientId: ingredient!.id,
        type,
        qty: signed,
        reason: [reason, note].filter(Boolean).join(' — ') || undefined,
        userId: session.user.id,
        userName: session.user.name,
      }),
      {
        successMessage: type === 'STOCK_COUNT'
          ? `${ingredient!.name} counted at ${formatBaseQty(baseQty, ingredient!.unit)}`
          : `${ingredient!.name} ${signed > 0 ? 'up' : 'down'} ${formatBaseQty(Math.abs(signed), ingredient!.unit)}`,
      },
    );

    if (result) { onSaved(); onClose(); }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ingredient.name}
      subtitle={`${formatBaseQty(onHand, ingredient.unit)} on hand · ${formatMoney(ingredient.costMinorPerUnit)} per ${ingredient.unit}`}
      width="md"
    >
      <div className="space-y-5">
        <div>
          <p className="eyebrow mb-1.5">What happened</p>
          <RadioGroup name="movement-type" value={type} onChange={setType} options={TYPES} />
        </div>

        <Field
          label={type === 'STOCK_COUNT' ? 'Counted quantity' : 'Quantity'}
          required
          htmlFor="qty"
          hint={type === 'STOCK_COUNT'
            ? 'What is actually there right now, not the difference.'
            : `Entered in whatever you are holding — converted to ${ingredient.unit} for the ledger.`}
        >
          <div className="flex gap-2">
            <QuantityInput
              id="qty"
              unit=""
              value={qty}
              min={0}
              onChange={setQty}
            />
            <Select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-40 shrink-0"
              aria-label="Unit"
            >
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </div>
        </Field>

        {baseQty !== null && unit !== ingredient.unit ? (
          <p className="-mt-3 text-xs text-muted">
            That is <span className="tnum font-mono">{baseQty.toLocaleString()} {ingredient.unit}</span>{' '}
            in the ledger.
          </p>
        ) : null}

        {needsReason ? (
          <Field label="Reason" required htmlFor="reason" hint="Waste with no reason is a number nobody can act on.">
            <Select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Pick a reason…</option>
              {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
        ) : null}

        <Field label="Note" htmlFor="note" hint="Optional. Goes on the ledger row and the audit log.">
          <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="rounded-md bg-sunk px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">On hand now</span>
            <span className="tnum font-mono">{formatBaseQty(onHand, ingredient.unit)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-sm">
            <span className="text-muted">After this</span>
            <span className={`tnum font-mono font-semibold ${projected < 0 ? 'text-status-alert' : ''}`}>
              {formatBaseQty(Math.max(0, projected), ingredient.unit)}
            </span>
          </div>
          {variance !== null && variance !== 0 ? (
            <p className={`mt-2 text-xs ${variance < 0 ? 'text-status-alert' : 'text-status-ready'}`}>
              Variance {variance > 0 ? '+' : ''}{formatBaseQty(variance, ingredient.unit)} —
              worth {formatMoney(Math.abs(Math.round(variance * ingredient.costMinorPerUnit)))}.
              {variance < 0 ? ' Stock is short of what the ledger expected.' : ' There is more here than expected.'}
            </p>
          ) : null}
        </div>

        {projected < 0 ? (
          <Notice tone="warning">
            That is more than is on hand. The balance will floor at zero, and the ledger will still show
            what you recorded — which is usually a sign the count is out rather than the entry.
          </Notice>
        ) : null}

        <FormActions
          dirty={valid}
          saving={saving}
          error={error}
          onSave={() => void submit()}
          saveLabel={type === 'STOCK_COUNT' ? 'Record count' : 'Record movement'}
        />
      </div>
    </Sheet>
  );
}
