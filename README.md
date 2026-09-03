# NOOKAA POS

Point of sale and store operations for **NOOKAA — Beverages & Beyond**.

A fully frontend-only demo: counter sales, a kitchen board, cup-QR pickup, an
app-order pickup code, ingredient-level inventory, staff attendance, an
in-app loyalty coin ("Nooks"), and a full admin section — no backend, no
database, nothing to configure. Everything runs in the browser's IndexedDB,
seeded automatically on first load.

```bash
npm install && npm run dev     # http://localhost:3000
```

Sign in with PIN `4444` for the counter, `1111` for the office. All demo
PINs are shown on the login screen.

## What it does

**For the bar**

- A POS that takes an order in one or two taps — 50 drinks, 10 categories,
  keyboard shortcuts, modifier defaults pre-selected, dine-in or takeaway
- A three-column board (New → Making → Ready) with a brew clock on every
  ticket
- Cup QR: every accepted order mints a cup ID and prints one label per drink,
  collected by camera scan, hardware scanner, or typing the code
- App orders carry their own customer-facing pickup code — the counter
  can't hand one over without scanning it or entering the code
- Cash, card, UPI and Razorpay at checkout, with a manual cash-tendered entry
- Stock visibility and waste logging
- Staff clock in and out automatically just by signing in and out

**For the office**

- Sales, timing and stock overview per store, with a global store switcher
- Every order ever taken, searchable, with a full status timeline
- Catalog: products, categories, modifiers, and recipes
- Inventory: an append-only ledger, receiving, waste, stock counts, and
  inter-store transfers
- Finance: payments, GST invoices, refunds with second-person approval
- Stores, devices, staff, attendance (with a per-person heatmap), and a live
  permission matrix generated from the code
- Nooks: the in-app loyalty coin, earned on every order and redeemable only
  through the app — its own admin section for balances and the full ledger
- Analytics: hourly demand shape, best sellers, dead stock, category and
  store splits

## How it's built

Next.js 14 · TypeScript · Tailwind · Zustand · IndexedDB. No backend, no
component library.

```
screens → services → repositories → IndexedDB
```

Screens never write state directly. A screen calls a service; the service
enforces the rule and writes through a repository. That one choke point is
why an order (or a refund, or a Nooks balance) can't reach an impossible
state.

Three decisions worth knowing:

- **Money is paise integers.** Never a float, anywhere.
- **Stock moves at PREPARING**, not at payment. Payment can be reversed; milk
  poured cannot.
- **Nothing financial is ever edited or deleted.** Cancellations and refunds
  are new records, and the status history is append-only.

## Prices are assumptions

The NOOKAA menu book has no prices. Every figure in this build is an
invented Mumbai specialty-café estimate, as are the recipe quantities and
ingredient costs.

## Deploying

Push to a Netlify-connected repo — `netlify.toml` is already set up
(`@netlify/plugin-nextjs`, no environment variables required). There is
nothing else to configure: no database, no secrets, no server.
