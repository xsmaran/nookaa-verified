'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Sheet, Textarea } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { ProductRepository } from '@/repositories';
import type { ModifierGroup, OrderItemModifier, Product } from '@/types';

/**
 * Modifiers.
 *
 * Opens only for products that actually have options, and pre-selects every
 * default, so the common case is: tap product, tap Add. Nothing is required
 * unless the drink genuinely cannot be made without it.
 */
export function ModifierSheet({
  product,
  onClose,
  onConfirm,
}: {
  product: Product | null;
  onClose: () => void;
  onConfirm: (product: Product, modifiers: OrderItemModifier[], note?: string) => void;
}) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [selected, setSelected] = useState<OrderItemModifier[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!product) return;
    setNote('');
    void ProductRepository.modifierGroupsFor(product.id).then((result) => {
      setGroups(result);
      setSelected(
        result
          .filter((g) => g.selection === 'SINGLE')
          .flatMap((g) => {
            const option = g.options.find((o) => o.isDefault);
            return option ? [{ groupId: g.id, optionId: option.id, name: option.name, priceMinor: option.priceMinor }] : [];
          }),
      );
    });
  }, [product]);

  const extraMinor = useMemo(() => selected.reduce((sum, m) => sum + m.priceMinor, 0), [selected]);

  if (!product) return null;

  const toggle = (group: ModifierGroup, optionId: string) => {
    const option = group.options.find((o) => o.id === optionId)!;
    const entry: OrderItemModifier = { groupId: group.id, optionId, name: option.name, priceMinor: option.priceMinor };
    setSelected((current) => {
      if (group.selection === 'SINGLE') {
        return [...current.filter((m) => m.groupId !== group.id), entry];
      }
      const exists = current.some((m) => m.optionId === optionId);
      if (exists) return current.filter((m) => m.optionId !== optionId);
      const inGroup = current.filter((m) => m.groupId === group.id).length;
      if (group.maxSelections && inGroup >= group.maxSelections) return current;
      return [...current, entry];
    });
  };

  const missingRequired = groups.filter((g) => g.required && !selected.some((m) => m.groupId === g.id));

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.spec}
      subtitle={product.name}
      footer={
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Line total</p>
            <p className="tnum font-mono text-lg font-bold">{formatMoney(product.priceMinor + extraMinor)}</p>
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={missingRequired.length > 0}
            onClick={() => onConfirm(product, selected, note.trim() || undefined)}
          >
            {missingRequired.length > 0 ? `Choose ${missingRequired[0].name.toLowerCase()}` : 'Add to order'}
          </Button>
        </div>
      }
    >
      <p className="mb-5 text-sm text-muted">{product.description}</p>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.id}>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="eyebrow">{group.name}</p>
              <span className="text-[11px] text-faint">
                {group.required ? 'Required' : group.selection === 'MULTI' ? `Pick up to ${group.maxSelections ?? group.options.length}` : 'Optional'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.options.map((option) => {
                const isOn = selected.some((m) => m.optionId === option.id);
                return (
                  <button
                    key={option.id}
                    onClick={() => toggle(group, option.id)}
                    className={`flex min-h-[52px] flex-col items-start justify-center rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      isOn ? 'border-ink bg-ink text-paper' : 'border-line bg-surface hover:border-muted'
                    }`}
                  >
                    <span className="font-semibold leading-tight">{option.name}</span>
                    {option.priceMinor > 0 ? (
                      <span className={`tnum font-mono text-[11px] ${isOn ? 'text-paper/70' : 'text-muted'}`}>
                        +{formatMoney(option.priceMinor, false)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section>
          <p className="eyebrow mb-2">Note for the bar</p>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Extra hot, no straw, separate cup…"
          />
        </section>
      </div>
    </Sheet>
  );
}
