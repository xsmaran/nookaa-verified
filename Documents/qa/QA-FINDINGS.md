# NOOKAA POS — QA Findings

**Scope:** Admin app (owner/admin/manager screens) plus the shared services/repositories it depends on.
**Reviewed against:** `origin/main` @ `a2b5562` (synced 2026-09-03). This is a full rewrite from the version first reviewed the same day — the entire server/API/database layer was removed in favour of a frontend-only build (`screens → services → repositories → IndexedDB`, no backend). **Per the developer, a real backend/database is coming for the testing and demo phase** — this document reflects the interim frontend-only state, and several items below (marked "re-check once the backend lands") are exactly the kind of rule a real server is expected to take back over.
**Not committed/pushed.** This file is untracked — review and decide whether it goes into the repo for the team.

---

## P0 — Critical

### 1. Pickup verification for app orders can be satisfied without ever seeing the customer's code
This is the most serious finding in this pass. The feature exists specifically so a barista can't hand an app order to the wrong person, but three independent shortcuts defeat it:

- **The real code is shown on the same screen as the box that asks for it.** [order-detail.tsx:249-270](src/components/orders/order-detail.tsx:249) renders a "Customer's pickup screen" panel — QR **and the plain 4-digit code** — directly above the "type the code" verification box, for any signed-in barista or admin viewing that order. *Test:* open any `READY` app order's detail page, read the code, type it into the box below it, click "Collect order."
- **The visible order-number suffix also works.** [qr-service.ts:85](src/services/qr-service.ts:85) falls back to `orderNumber.endsWith(needle)` when the pickup-code lookup misses — and that same 4-digit suffix is printed in bold on the Ready-to-Pick card at [pickup/page.tsx:67](src/app/(barista)/pickup/page.tsx:67). *Test:* on `/pickup`, read the bold number on any card, type it into pickup verification on a different device/session — it resolves and completes hand-over.
- **Scanning the cup label the barista is already holding also works**, and always claims verification happened regardless: `/scan` ([scan/page.tsx:63](src/app/(barista)/scan/page.tsx:63)), the barista orders board's scan handler ([orders/page.tsx:109](src/app/(barista)/orders/page.tsx:109)), and the scan page's manual-entry fallback ([scan/page.tsx:129](src/app/(barista)/scan/page.tsx:129)) all unconditionally pass `{ verifiedPickup: true }` to `OrderService.advance()`. The flag ([order-state check at order-service.ts:260](src/services/order-service.ts:260)) doesn't actually know *how* the calling screen got there — it just trusts whichever caller sets it.

No rate limiting either way (4-digit code = 10,000 combinations, no lockout) — moot given the above, but worth knowing.

### 2. Enforcement is entirely client-side now, and PINs are plaintext (carried over, unchanged)
[session-store.ts:71](src/stores/session-store.ts:71) matches PINs in plaintext straight out of IndexedDB; the session (role + full permission list) is a `zustand/persist` store in plain `localStorage`. Anyone with DevTools can read every staff PIN or grant themselves OWNER with no PIN at all. `refund-service.ts` itself documents this: *"There is no database constraint to fall back on any more... the check below is the only thing standing between a till and self-approved money."* **Re-check entirely once the backend lands** — this is presumably exactly what server-side auth is meant to fix.

### 3. Declining a refund always force-completes the order, even if it had been cancelled
[refund-service.ts:81-83](src/services/refund-service.ts:81) unconditionally sets the order to `COMPLETED` on reject, regardless of whether it was `CANCELLED` or `COMPLETED` before the refund was raised. A cancelled, never-handed-over order gets flipped to `COMPLETED` and starts counting as revenue. *Test:* elevated-cancel a paid order → raise a refund → reject it → order now shows `COMPLETED`.

### 4. Refund amount is never validated against what's actually refundable
[payment-service.ts:49-70](src/services/payment-service.ts:49) (`requestRefund`) creates a `PENDING` refund for whatever `amountMinor` it's given — no check against the order total or amount already refunded. The old server-side version had this cap; it's gone in the rewrite. Not reachable through today's UI (the only wired caller, `OrderService.cancel()`, always passes the full order total — the Order Detail page's own partial-refund buttons are broken, see #8), but the function itself and `OrderService.refund()` would accept anything if called from a future UI button or the console. **Fix before any UI adds a "partial refund" form.**

### 5. Nooks (loyalty coins) earned on an order are never clawed back on cancellation or refund
[order-service.ts](src/services/order-service.ts) credits Nooks once, at payment ([line ~136](src/services/order-service.ts:136)), and neither `cancel()`, `refund()`, nor `refund-service.ts`'s `decide()` ever calls `NooksService` again — there isn't even a clawback transaction type defined ([types/index.ts:538](src/types/index.ts:538)). *Test:* place an order that earns Nooks, note the balance, fully refund or cancel it — the balance stays credited.

### 6. Discount date window, usage limit, and per-customer limit are validated for shape only, never enforced at sale
[order-service.ts:76-79](src/services/order-service.ts:76) looks up a discount by code and applies it via `calculateTotals` with no check of `startsAt`/`endsAt`/`usageLimit`/`perCustomerLimit` — those fields are validated when a discount is *created* ([discount-repository.ts:91-101](src/repositories/discount-repository.ts:91)) but nothing re-checks them when a code is actually redeemed. An expired or over-used code still works at the till. (Nooks earn itself is correctly computed on the post-discount amount — verified, not a bug.)

---

## P1 — Race conditions (no transactions anywhere in an IndexedDB-only app)

Every one of these is the same shape: a `list()`/`find()` read, then a separate `put()` write, with nothing preventing two near-simultaneous calls from both reading the same "before" state.

| # | What races | Where | Consequence |
|---|---|---|---|
| 7 | Duplicate **discount codes** | [discount-repository.ts:106-118](src/repositories/discount-repository.ts:106) check vs. line 161 write | Two codes with the same string; lookup resolves non-deterministically |
| 8 | Duplicate **store codes** | [store-repository.ts:91-100](src/repositories/store-repository.ts:91) vs. line 162 | Store codes are embedded in order numbers — a collision makes two stores' order numbers ambiguous |
| 9 | Duplicate **staff PINs** | [staff-service.ts:51-55](src/services/staff-service.ts:51) vs. create/update | `session-store.ts`'s `.find()` returns the *first* match on sign-in — the second person's actions get attributed to whoever shares their PIN |
| 10 | Duplicate **product SKUs** | [product-repository.ts:89-99](src/repositories/product-repository.ts:89) vs. line 251 | Same TOCTOU shape |
| 11 | **Nooks redemption** checks a caller-supplied balance, not a fresh read | [nooks-service.ts:92-100](src/services/nooks-service.ts:92) | Two concurrent redemptions can each grant discount value against the same starting balance |
| 12 | **Customer record** (`nooksBalance`/`totalOrders`/`totalSpendMinor`) | [customer-repository.ts:51-69](src/repositories/customer-repository.ts:51) | Two orders for the same phone processed close together can clobber each other's update |
| 13 | **Double sign-in** creates two open attendance rows | [attendance-service.ts:42-96](src/services/attendance-service.ts:42) | Same person clocked in twice (two tabs/devices); sign-out only closes one; attendance rate over-counts that day |

**14. A shift crossing midnight is never closed.** [attendance-service.ts](src/services/attendance-service.ts) looks for *today's* open row on sign-out; clock in at 11:50pm, sign out at 12:10am, and the sign-out silently no-ops against a day that has no open row. **No admin remedy exists** for a stuck "on shift" row — no edit or force-clock-out action anywhere in the Attendance screen.

---

## P1 — Broken UI workflow (carried over, confirmed still present, unchanged)

**15. "Request refund" / "Decline refund" buttons on Order Detail are still complete no-ops.** [order-detail.tsx:364-376](src/components/orders/order-detail.tsx:364) still routes every reason-requiring action through one hardcoded "Cancel order?" sheet that always calls `OrderService.cancel()`. `COMPLETED→CANCELLED` still isn't a legal transition, so it throws; the confirm handler still has no `catch`. Nothing happens, no error shown. (The tested happy path — cancelling a still-open order, which auto-raises a refund — works fine.)

---

## P2 — Input validation

**16. Modifier option prices accept negative values through the real admin UI**, unlike every other price field in the app. [modifier-repository.ts:38-58](src/repositories/modifier-repository.ts:38) validates the group name and single-default rule but never checks `option.priceMinor`; the shared `MoneyInput` used on the modifiers page ([form.tsx:105-121](src/components/ui/form.tsx:105)) only has a cosmetic HTML `min="0"`. *Test:* New modifier group → add an option → type `-5` into its extra-charge field → save. Since every selected modifier's price is added into the order total ([pricing.ts:10-13](src/lib/pricing.ts:10)), this becomes an unaudited, uncapped discount on any order using it. (Product and discount forms correctly reject this — only modifiers were missed.)

**17. `MoneyInput`/quantity `min="0"` is cosmetic everywhere else too, and edit sheets discard unsaved changes with no confirmation** — both confirmed unchanged from the prior review (the underlying files are byte-identical to before the rewrite).

---

## P2 — Error handling

**18.** `order-service.ts` (lines ~71, 153, 270) and `session-store.ts` (sign-in failures) throw raw `Error` instead of the app's own `DomainError`/`ValidationError` — every repository reviewed does this correctly, these two files are the outliers.

**19.** Caller-supplied `id` on category/ingredient/modifier creation ([category-repository.ts:70](src/repositories/category-repository.ts:70) and similar) silently overwrites an existing record on collision rather than erroring — latent; no admin form currently lets someone type a custom id, so not reachable today.

**20.** `audit-repository.ts`'s `redact()` only strips sensitive keys at the top level of an object, doesn't recurse into nested values — latent; every current caller happens to pass `pin` at the top level, so nothing leaks today, but it would silently fail to redact a nested sensitive field.

---

## P3 — Dependencies & tooling

**21. Next.js 14.2.35 (pinned) has 2 high-severity `npm audit` advisories** spanning DoS, SSRF, and cache-poisoning issues across several Next.js subsystems. Fixing requires a breaking upgrade to Next 16 (`npm audit fix --force`) — a real decision for the developer, not something to silently apply.

**22. No ESLint config is committed to the repo.** `npm run lint` prompts interactively on a fresh checkout instead of actually linting anything — minor, but worth fixing so CI/a fresh clone can lint at all.

---

## Confirmed fixed since the last review (good news)

- **Stock cache vs. ledger-rebuild divergence — fixed.** Both the live path ([inventory-repository.ts:64-65](src/repositories/inventory-repository.ts:64)) and `InventoryService.rebuild()` now clamp to zero using the identical per-transaction replay logic, so they can no longer permanently disagree.
- **Staff self-deactivation — fixed, and self-role-change is newly blocked too.** [staff-service.ts:207](src/services/staff-service.ts:207) has a dedicated `deactivate()` method with an explicit self-check, and the admin UI's Deactivate button correctly calls it ([staff/page.tsx:53](src/app/(admin)/admin/staff/page.tsx:53)).
- **`npm run typecheck` passes with zero errors.** No actual TypeScript/syntax errors found, mechanically confirmed.
- All of the previous review's API-route IDOR/permission findings are **moot** — those routes no longer exist in this architecture.

## Stale comments worth a cleanup pass

`rbac.ts`, `order-service.ts` (the discount-pricing comment), and `inventory-repository.ts` all still contain comments describing server-side re-validation ("the API is the only enforcement that counts," "`/api/discounts/check`," "will be applied by the server") that was removed along with the backend. Harmless today, but could mislead a developer into assuming a safety net exists where there isn't one.

## Not yet audited

`catalog-cache.ts` (only grepped, not read end-to-end), the individual admin CRUD forms for categories/ingredients/products/stores/settings/audit beyond what their backing repositories enforce, and `invoice-service.ts`/`notification-service.ts` in depth.
