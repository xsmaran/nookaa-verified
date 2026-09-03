import { localStore } from '@/lib/local-db';
import { uuid } from '@/lib/ids';
import { DomainError, ValidationError } from '@/lib/errors';
import { AuditRepository } from './audit-repository';
import type { Category, Product, Session } from '@/types';

/**
 * Categories — the frontend-only replacement for /api/categories.
 *
 * Same rules the server enforced: a category cannot be archived while it
 * still has products in it (that would leave drinks orphaned on a menu rail
 * that no longer shows their tab), and a reorder writes the whole list in one
 * batch so no two categories can end up claiming the same slot.
 */

export interface CategoryRow extends Category { productCount: number }

export interface CategoryInput {
  id?: string;
  name: string;
  shortName: string;
  tagline?: string | null;
  imageUrl?: string | null;
  active?: boolean;
  sortOrder?: number;
}

function validate(input: Partial<CategoryInput>): void {
  const fieldErrors: Record<string, string> = {};

  const name = (input.name ?? '').trim();
  if (!name) fieldErrors.name = 'A category needs a name.';
  else if (name.length > 80) fieldErrors.name = 'Keep it under 80 characters.';

  const shortName = (input.shortName ?? '').trim();
  if (!shortName) fieldErrors.shortName = 'The POS tab needs a short label.';
  else if (shortName.length > 24) fieldErrors.shortName = 'Keep it under 24 characters.';

  const tagline = (input.tagline ?? '').trim();
  if (tagline.length > 200) fieldErrors.tagline = 'Keep it under 200 characters.';

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Check the highlighted fields.', fieldErrors);
  }
}

async function productCountFor(categoryId: string): Promise<number> {
  const products = await localStore().list<Product>('products');
  return products.filter((p) => p.categoryId === categoryId && !p.archivedAt).length;
}

export const CategoryRepository = {
  async all(includeArchived: boolean): Promise<CategoryRow[]> {
    const categories = await localStore().list<Category>('categories');
    const rows = includeArchived ? categories : categories.filter((c) => !c.archivedAt);
    const withCounts = await Promise.all(
      rows.map(async (c) => ({ ...c, productCount: await productCountFor(c.id) })),
    );
    return withCounts.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },

  async byId(id: string): Promise<Category | undefined> {
    return localStore().get<Category>('categories', id);
  },

  async create(input: CategoryInput, session: Session | null): Promise<Category> {
    validate(input);
    const existing = await localStore().list<Category>('categories');
    const category: Category = {
      id: input.id?.trim() || uuid(),
      name: input.name.trim(),
      shortName: input.shortName.trim(),
      tagline: (input.tagline ?? '').trim(),
      imageUrl: input.imageUrl ?? null,
      // New categories go to the end of the POS rail rather than the front,
      // where they would displace whatever the bar is used to reaching for.
      sortOrder: input.sortOrder ?? existing.length + 1,
      active: input.active ?? true,
      archivedAt: null,
    };
    await localStore().put('categories', category.id, category);
    await AuditRepository.record({
      session, entity: 'category', entityId: category.id, entityLabel: category.name,
      action: 'created', after: category, summary: `created category ${category.name}`,
    });
    return category;
  },

  async update(id: string, patch: Partial<CategoryInput>, session: Session | null): Promise<Category> {
    const before = await localStore().get<Category>('categories', id);
    if (!before) throw new DomainError('That category no longer exists.');
    validate({ ...before, ...patch });

    const after: Category = {
      ...before,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.shortName !== undefined ? { shortName: patch.shortName.trim() } : {}),
      ...(patch.tagline !== undefined ? { tagline: (patch.tagline ?? '').trim() } : {}),
      ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    };
    await localStore().put('categories', id, after);
    await AuditRepository.record({
      session, entity: 'category', entityId: id, entityLabel: after.name,
      action: 'updated', before, after, summary: `updated category ${after.name}`,
    });
    return after;
  },

  /**
   * Archive rather than delete. Refused while drinks still point at it —
   * archiving anyway would leave those products in a category the POS no
   * longer shows, a menu with a hole in it nobody notices until asked for.
   */
  async archive(id: string, session: Session | null): Promise<Category> {
    const category = await localStore().get<Category>('categories', id);
    if (!category) throw new DomainError('That category no longer exists.');

    const count = await productCountFor(id);
    if (count > 0) {
      throw new DomainError(
        `${count} ${count === 1 ? 'drink is' : 'drinks are'} still in ${category.name}. Move them first.`,
      );
    }

    const at = new Date().toISOString();
    const after: Category = { ...category, archivedAt: at, active: false };
    await localStore().put('categories', id, after);
    await AuditRepository.record({
      session, entity: 'category', entityId: id, entityLabel: category.name,
      action: 'archived', before: category, after, summary: `archived category ${category.name}`,
    });
    return after;
  },

  async restore(id: string, session: Session | null): Promise<Category> {
    const category = await localStore().get<Category>('categories', id);
    if (!category) throw new DomainError('That category no longer exists.');

    const after: Category = { ...category, archivedAt: null, active: true };
    await localStore().put('categories', id, after);
    await AuditRepository.record({
      session, entity: 'category', entityId: id, entityLabel: category.name,
      action: 'restored', before: category, after, summary: `restored category ${category.name}`,
    });
    return after;
  },

  /**
   * Drag-to-reorder sends the whole list; one batch write keeps it
   * consistent so no till ever sees two categories claiming the same slot
   * mid-drag.
   */
  async reorder(orderedIds: string[], session: Session | null): Promise<void> {
    const entries: Array<[string, Category]> = [];
    for (let index = 0; index < orderedIds.length; index++) {
      const id = orderedIds[index];
      const category = await localStore().get<Category>('categories', id);
      if (!category) continue;
      entries.push([id, { ...category, sortOrder: index }]);
    }
    await localStore().putMany('categories', entries);
    await AuditRepository.record({
      session, entity: 'category', entityId: 'all', action: 'reordered',
      summary: `reordered ${orderedIds.length} categories`, after: { orderedIds },
    });
  },
};
