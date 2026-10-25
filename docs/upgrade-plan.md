# UPGRADE PLAN: CarShop.Pk POS (Version 1) → ProductLogik POS (Version 2)
## Multi-Industry Inventory, Invoicing, Statements of Account & Billing System

> **Status (2026-10-20)**: PLAN ONLY, waiting for approval. No application code, source file or migration has been changed for Version 2.
> **Starting point**: Version 1 = git tag `v1.0.0` (commit `488c161`, last feature commit `dafe024`), Phases 1–15 as recorded in `docs/PROJECT_SPEC.md` §7.
> **Brief**: `docs/upgrade.md`, as amended by the product owner on 2026-10-20 (see "Plan revisions" below). **Brand source**: `D:\SpicedProjects\Projects\productlogik` (`assets/logo.svg`, `assets/logo.png`, `frontend/public/logo.png`, `frontend/tailwind.config.js`, `README.md`).
> **How to start a phase**: the product owner says *"Plan approved, proceed with Phase [X]"*. One phase at a time; each phase ends at its checkpoint and waits.

### Plan revisions
- **Rev 1 (2026-10-19)**: first draft from `docs/upgrade.md` (a general-purpose retail checkout POS).
- **Rev 2 (2026-10-20)**: two changes from the product owner:
  1. **Every industry gets the full system**, not just automotive. **Categories are managed by the superadmin**, not by organization admins. Categories are linked to industries (and, when the superadmin chooses, to single organizations). An organization sees only the categories of its own industry plus its own. This is now Phase 18.
  2. **The product is positioned as an inventory-tracking, invoicing, statement-of-account (SOA) and billing system**, not a supermarket checkout register. The checkout-only features from the brief move to **Appendix A (not scheduled)**: the `/pos` cashier screen, cash shifts with X/Z reports, cash drawer kick, park/hold, PIN fast-switch, loyalty and promo codes. In their place come delivery challans, sales tax invoices, a customer ledger with receipt vouchers and cheque tracking, statements of account, supplier payables and recurring billing.

- **Rev 3 (2026-10-20)**:
  - **Multiple stores**: every store's stock is visible to all members. Documents invoice only the current store's stock unless the organization allows other stores (Phase 20).
  - **The superadmin is a true super admin**: they can create and manage every organization, user, setting and element of the app (new Phase 17; decision 13). Later phases moved up by one, so Version 2 = Phases 16–33.
- **Rev 4 (2026-10-20)**:
  - **§11 lists the industries** that can use the system: 14 launch industries seeded in Phase 18, 20 later industries the superadmin can add, and the poor fits.
  - Organizations are **archived, never deleted**, and their rows in the superadmin view change colour every 30 days from light yellow to dark red over a year (Phase 17).
  - **Recommended features** are listed per phase (§10) and offered when that phase starts (§0.4).
  - Phase 18 says how categories for the other industries are drafted, reviewed, seeded and then maintained by the superadmin.
- **Rev 5 (2026-10-20, during Phase 16)**: the product owner added **dark mode with a theme switcher** to Phase 16 (RF-16.4, deliverable 9). Version 1 had no dark theme, so deliverable 4 and the checkpoint, which already said "dark mode" and "light and dark", now point to a real deliverable. RF-16.1–16.3 were accepted when Phase 16 started.
- **Rev 6 (2026-10-20, before Phase 17)**: the product owner added **subscription plans with manual payments** to Phase 17 (deliverable 9). Organizations pay for ProductLogik POS by mobile wallet (JazzCash, Easypaisa and similar) or bank transfer, never online. The superadmin creates and manages the plans (price, billing cycle, number of stores, users, products and modules), assigns one to each organization, issues subscription invoices, and records or verifies payments. Plan limits replace the separate per-organization limits in deliverable 1 (the per-organization values stay as overrides). This takes in and replaces RF-17.3 "Subscription tracking". Online payment gateways stay out of scope.
- **Rev 7 (2026-10-22, during Phase 18)**: three decisions from the product owner on what the other industries need:
  1. **Batch & expiry tracking is now part of Phase 24** (deliverable 6), no longer an optional extra. Pharmacy is a launch industry and can't work without it. The former RF-24.1 is closed.
  2. **Serial numbers / IMEI per unit** is a new recommended feature, **RF-24.4**, offered when Phase 24 starts. Mobile phone and computer shops need it for warranty claims and theft checks.
  3. **Counter sales stay out** (Appendix A). ProductLogik POS is a hosted web app. It can't run locally at the counter, and over the internet it would be too slow for a scan-and-pay checkout queue. Walk-in invoices, barcodes (Phase 23), the quick counter invoice (Phase 26 deliverable 8) and the POS slip cover counter needs.
- **Rev 8 (2026-10-22, during Phase 18)**: **the superadmin creates every organization; there is no self sign-up.** `/register`, the "Open sign-up" platform switch and the on-signup database trigger are removed. Create Organization provisions the organization through the service-role function `admin_create_organization()`, so a direct call to the public sign-up API can't create one. The other platform settings stay and now apply to new organizations (default plan, its starting status). An industry's active flag now means "open for new organizations" (offered in Create Organization). Open question 5 (§8) is answered by this.
- **Rev 9 (2026-10-25, during Phase 19)**: the product owner asked for **packs to be switched on in Settings** and for each organization to choose **which units can be packs** (Phase 19, deliverable 6). Purchase orders stay in Phase 25, built in sequence; Phase 25 deliverable 2 now spells out that PO lines are entered in boxes / cartons (starting in the product's buy-in unit) and received into stock in base units.
- **Rev 10 (2026-10-25, Phase 20 start)**: **RF-20.1 store prices and RF-20.2 per-store numbering are accepted** (Phase 20 deliverables 7 and 8). Until Phase 22 adds the manager role, "managers/admins" in the cross-store invoicing rule means admins.
- **Rev 11 (2026-10-25, during Phase 20)**: **stores and users are part of the paid subscription.** Only the superadmin changes plans and limits (the organization can only request a change). Organization admins add stores and invite users **up to their subscription's limits** (the plan's, or the organization's own override; the database refuses more) and manage them: store details, codes, who works where, store rules; team roles, deactivating, pending invites. **Deleting a store and switching a store off or back on is console-only**; past a limit, the superadmin raises it on the organization's Subscription tab or adds the store or user from the console. Phase 22's Team updates and Phase 17's console tools follow this rule.
- **Rev 12 (2026-10-25, during Phase 20)**: **organization users sign in with a username and password, not email** (Phase 22, deliverable 6). Many shop staff don't use email or set their own passwords, so: usernames are unique across ProductLogik; the organization admin sets each user's password and changes it when needed (no invitation emails, no email reset, no forced change); org admins sign in the same way and keep an email only for notifications; their own passwords are reset by ProductLogik. Superadmins keep email + password + 2FA. Until Phase 22, V1's email invitations stay.
- **Rev 13 (2026-10-26, during Phase 20)**: the product owner asked for **superadmins to change their own password in the console** (Phase 22, deliverable 6). Until then it's changed in the Supabase dashboard.

---

## 0. HOW TO READ THIS PLAN

### 0.1 Phase numbering
Version 2 phases **continue the global numbering at Phase 16**, so commit messages keep the existing `Phase <N> - <summary>` format without colliding with Version 1's Phases 1–15 in `git log`, `docs/dev-stages-results.md` and the spec. Version 2 = **Phases 16–33**, grouped into six milestones:

| Milestone | Phases | Outcome |
| :--- | :--- | :--- |
| **M1 · Identity** | 16 | The app, repo and docs are ProductLogik POS (emerald brand, new name, new repo URL). |
| **M2 · Multi-industry foundations** | 17 – 22 | Superadmin full control plane, industries and superadmin-managed categories, units and decimal quantities, multiple stores (all stock visible; invoicing from the current store, or other stores if the organization allows it), variants, roles and approvals. |
| **M3 · Inventory operations** | 23 – 25 | Barcodes and labels, stock ledger/adjustments/counts/transfers, suppliers, purchase orders, receiving and supplier bills. |
| **M4 · Invoicing** | 26 – 28 | Sales orders, delivery challans, per-line tax and sales tax invoices, price lists, a document printing engine, credit/debit notes and returns. |
| **M5 · Accounts, SOA & billing** | 29 – 31 | Customer ledger, receipt vouchers, cheques, credit control, statements of account, collections, supplier statements, recurring billing. |
| **M6 · Release** | 32 – 33 | Inventory and receivables reporting, hardening, documentation, tag `v2.0.0`. |

### 0.2 Rules carried over from Version 1 (unchanged)
- **Multi-tenant RLS "digital lock"** on every new table: a `tenant_id` column, RLS on, policies through `private.current_tenant_id()` (so impersonation and suspended/deactivated cut-offs keep working), `private.is_shop_admin()` and the new permission helper (Phase 22). Global tables (industries, the category catalog) are read-only to organizations and written only by the superadmin through the service role.
- Migrations are applied through the Supabase MCP and saved to `supabase/migrations/` under the version Supabase records. Run `npm run db:types` after each one.
- Totals, stock and balances are computed in SQL (security-definer RPCs and triggers) and mirrored in TypeScript only for live previews. The client never writes stock or money directly.
- Follow the Next.js 16.4 conventions already in this repo: `src/proxy.ts`, Cache Components, session reads inside `<Suspense>`, `connection()` before cookies. **Read the relevant guide in `node_modules/next/dist/docs/` before writing code in each phase** (AGENTS.md).
- **Superadmin parity** (decision 13): every setting, list, user action and element a phase adds must also be manageable by the superadmin for any organization: from the console through the shared `resolveTarget()` actions, and inside the organization through impersonation. Every superadmin action is audited. Phase 17 builds the framework.
- Responsive at phone 390 / tablet 820 / laptop 1366 / desktop 1920 / ultrawide 3440, with no sideways page scroll and 44px touch targets.
- `PROJECT_SPEC.md`: §8 lists what is still to build. When a phase is done, it moves to §7 with its commit, and its summary is appended to `docs/dev-stages-results.md`. Commit as `Phase <N> - …`, then push to `origin/main`.
- Still **out of scope**:
  - online payment gateways (Stripe, card-not-present)
  - native mobile binaries
  - bin/aisle warehouse locations
  - serial-number tracking
  - VIN decoding
  - a full double-entry general ledger (chart of accounts, journals, trial balance); V2 keeps receivables and payables sub-ledgers that an accountant can export
  - automated WhatsApp sending (WhatsApp stays click-to-chat)

  Multi-store stock is now **in** scope; §2.1 of the spec is updated in Phase 16.

### 0.3 Standard checkpoint (every phase)
Every phase's own checklist is in addition to this:
1. `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass.
2. Each migration is verified in SQL inside a rolled-back transaction: tenant isolation (shop A can't read or write shop B), role limits, constraint failures, and the RPC happy path plus failure paths.
3. Supabase advisors (`get_advisors`, security + performance) show no new warnings.
4. Browser test against the **production build** with a temporary shop: no console errors, all five viewports above.
5. Regression: the Version 1 flows still work (draft → quotation → invoice → payment, PDFs/slip, share link, CSV import, admin/impersonation). A saved regression checklist grows phase by phase; Phase 16 creates it as `docs/regression-checklist.md`.
6. Superadmin parity: everything the phase adds can be changed by the superadmin from `/admin` for another organization, and through "Login As", with audit rows. Org admins can't reach the console actions.
7. Test data is removed, and spec §7/§8 and `docs/dev-stages-results.md` are updated. **STOP**: report the results and wait for the go-ahead to commit.

### 0.4 Recommended features: asked when a phase starts
Each phase has a short list of **recommended features** (§10) that are in scope but not part of the phase until accepted.
- When the product owner says *"proceed with Phase N"*, the **first step**, before any code, is to list Phase N's recommended features, each with a one-line description, and ask which to build with this phase.
- **Accepted** features are added to that phase's deliverables and checkpoint and built in that phase.
- **Declined** ones are marked in §10 and not offered again.
- Features are **never offered before their phase starts, and never built after it ends**, unless the product owner asks for one by ID (e.g. "add RF-24.2").

---

## 1. CURRENT STATE SUMMARY (WHAT VERSION 1 GIVES US)

| Area | Version 1 (as built) | What Version 2 must change |
| :--- | :--- | :--- |
| Brand | "CarShop.Pk POS System": black/white + racing red (`--brand-red #ea1b25`, `--blue #d9161f` used as the accent), Inter, `public/brand/*`, `carshop_logo/` | ProductLogik POS: emerald/teal, lightning-bolt mark, Plus Jakarta Sans |
| Industries & categories | Automotive only. Each shop gets its own copy of 157 automotive categories (`categories.tenant_id`), and shop admins edit them | Superadmin-managed industries, each with its own category catalog. Organization-specific categories are added by the superadmin; organizations get read-only access plus "request a category" |
| Catalog | `inventory_items`: integer `quantity_on_hand`, `reserved_quantity`, generated `available_quantity`/`is_low_stock`, `is_universal` + `item_vehicle_compatibility`, free-text `vendor_name` | Fitment as an optional module, decimal quantities + UOM, barcodes, variants, per-store stock with a ledger, suppliers |
| Invoicing | One `quotes` table with three stages (draft / quotation / invoice), `quote_items`, `save_quote`, `convert_quote`, stock deducted at invoicing (`quote_items_sync_stock`), a single shop tax rate, A4 PDF + 80mm slip, share links, email | Sales orders, delivery challans (partial deliveries), proforma, per-line tax categories and sales tax invoice layout, price lists, credit/debit notes, print templates |
| Money in | `invoice_payments` + `invoice_payment_items` (Cash / Card Terminal / Bank Transfer / Check), quick cash, `credit_days`, due dates, aging in reports | A customer ledger as the source of balances, receipt vouchers with allocation and advances, cheque tracking, credit limits, statements of account, collections |
| Money out | None | Supplier bills, supplier payments, payables aging, supplier statements |
| Billing | Manual invoices only | Recurring invoice schedules and batch billing runs |
| Superadmin | `/admin`: tenants (create, edit company details, status), users (role, password reset, temporary password), impersonation, audit | Full control: every organization setting from the console, create/edit/delete users in any organization, plan limits, archive/restore organizations (never deleted, rows coloured by archive age), read-only impersonation, platform settings and global catalogs, superadmin team |
| People | `profiles.role` admin / staff, `is_superadmin`, `deactivated_at`, team invites, impersonation | Sales / Storekeeper / Accountant / Manager / Admin roles + permissions, manager approvals |
| Places | One shop = one tenant, one stock figure per item | Multiple stores per organization: every store sees all stock; invoices take stock from the current store only, unless the organization allows other stores |

---

## 2. KEY ARCHITECTURE DECISIONS (PROPOSED — CONFIRM BEFORE PHASE 17)

Each one below is the recommended option.

1. **Keep `quotes` as the commercial-document table; don't rename it.** Quotation → (sales order) → invoice keeps being one row moving through stages, as in V1, with a new optional `ordered` stage. **Delivery challans** are separate linked documents (`deliveries`), because one order can be delivered in several parts. A **proforma invoice** is a print variant of a quotation or order, not a separate record. Renaming `quotes` → `documents` would touch nearly every RPC, trigger and policy for no user-visible gain; a read-only `sales_documents` view can give reports a clearer name.
2. **One sellable row = one `inventory_items` row (the variant / SKU).** Variants are added through a parent `product_groups` table plus option values on the item (Phase 21), so every existing stock trigger, RPC, CSV and search keeps working on `inventory_items`.
3. **Decimal quantities.** `quantity_on_hand`, `reserved_quantity` and `low_stock_threshold` go from `integer` to `numeric(14,3)`, and `quote_items.quantity` from `numeric(10,2)` to `numeric(14,3)`. Each UOM has its own number of decimals (pcs = 0, kg = 3, meter = 2), enforced in the RPCs.
4. **Per-store stock with a cached total and a ledger.**
   - New table `stock_levels (item_id, store_id, on_hand, reserved)`.
   - `inventory_items.quantity_on_hand` / `reserved_quantity` become trigger-maintained totals, so V1 screens, reports and alerts keep working.
   - Every stock change goes through one function, `private.apply_stock`, which also writes `stock_movements`. The table is created in Phase 20 so history starts on day one; the UI comes in Phase 24.
   - Every member can **view** all stores' stock. Documents **reserve and deduct only from the current store** by default. Invoicing from other stores is an optional organization setting (Phase 20), enforced in SQL.
   - Organizations choose **when stock leaves**: at the delivery challan, or at the invoice (V1 behaviour, the default).
5. **Automotive features become the "Vehicle Fitment" module** (`tenants.modules text[]`).
   - On by default for the Automotive Accessories industry; the superadmin can switch it per organization.
   - Off: no YMM picker, no fitment column/filter, no vehicle cell in CSV, no `/api/vehicles`.
   - The global `vehicles` catalog stays as it is.
6. **Industries and categories are platform data, managed by the superadmin** (Rev 2):
   - `industries` is a global table.
   - `categories` rows are either **industry catalog** rows (`industry_id` set, `tenant_id` null) or **organization-specific** rows (`tenant_id` set, created by the superadmin).
   - Each tenant has one `industry_id`.
   - RLS shows an organization only its industry's catalog (minus categories the superadmin hid for it) and its own rows. Organizations have **no write access** to categories; they can only send a category request.
   - **Every feature is available to every industry**; the industry only sets the catalog, default units, starting settings and default modules.
7. **Roles + a permissions table, not hard-coded role checks.**
   - Fixed roles (`sales`, `storekeeper`, `accountant`, `manager`, `admin`) map to a permission list in SQL (`private.role_permissions`), checked with `private.has_permission('…')`. V1 `staff` migrates to `sales`.
   - Exceptions (a discount above the limit, selling over a credit limit, a price override, cancelling a posted invoice, writing off a balance) go through **manager approval**: an approval request in the app, or immediate approval when a manager enters their password/PIN in the same dialog. Both are logged.
8. **The customer ledger is the source of truth for balances and statements.**
   - Every invoice, credit note, receipt voucher, advance, opening balance, write-off and bounced cheque posts a signed row to `customer_ledger`, written only by triggers/RPCs.
   - Invoice-level `amount_paid` (V1) stays and is kept consistent through allocations, so V1 screens keep working.
   - The same pattern applies to suppliers (`supplier_ledger`).
9. **Tax per line.** Items get a tax category (standard, reduced, zero-rated, exempt, with a rate per organization; Pakistan defaults: 18% standard, 0% exempt). Document lines snapshot the rate. This replaces V1's single document rate, which is migrated as each line's rate. It's needed for sales tax invoices and the tax report.
10. **Internal identifiers that say "carshop"** are renamed to `productlogik` in Phase 16: the `x-carshop-impersonation` header, the `carshop_impersonation` cookie and the `__carshopLeaveGuard` history marker. Both old and new names are accepted for one release, so nobody is logged out or loses an impersonation session mid-deploy. The old names are removed in Phase 33.
11. **Numbering series** through the existing `next_document_number` design, each with a prefix and start number in Settings → Documents:
   - **Sales**: Sales Order `SO`, Delivery Challan `DC`, Credit Note `CN`, Receipt Voucher `RV`.
   - **Purchasing**: Purchase Order `PO`, Goods Receipt `GRN`, Supplier Bill `BILL`, Debit Note `DN`, Payment Voucher `PV`.
   - **Stock**: Adjustment `ADJ`, Stock Count `SC`, Transfer `TR`.
12. **No checkout register in V2.** Fast counter sales are covered by the V1 builder plus barcode scan-to-add (Phase 23), the V1 quick-cash payment dialog and the 80mm slip. The cashier-terminal features are listed in **Appendix A** and are not planned (Rev 7: a hosted web app is too slow for a scan-and-pay checkout queue).

13. **The superadmin is a superset of every organization admin**, plus platform owner:
   - One implementation per setting: each server action takes an optional target `tenantId` resolved by `resolveTarget()` (own organization via RLS, or any organization via the service role when `requireSuperadmin()` passes, with a before/after audit row). The console reuses the organization's own forms.
   - Operational data is reached through impersonation (full or read-only), with every permission.
   - Platform-wide data (industries, categories, vehicle catalog, defaults, sign-up and email rules) is superadmin-only.
---

## 3. DATA MODEL OVERVIEW (NEW AND CHANGED TABLES)

All tables below carry `tenant_id` + RLS unless marked *global*. The detailed DDL is written in each phase's migration; this is the map.

```
industries (global) ── categories (industry catalog rows, global)
     │                     └── categories (organization-specific rows, tenant_id set)
     │                     └── tenant_hidden_categories · category_requests
subscription_plans (global) ── tenant_subscriptions (+ history) ── subscription_invoices ── subscription_payments
     │
tenants (+ industry_id, modules) ──┬── stores ── stock_levels (item × store) · profile_stores
                                   ├── profiles (+ role) ── profile_stores · approval_requests
                                   ├── units_of_measure · tax_categories · price_lists ── price_list_items
                                   ├── product_groups ── product_option_* ── inventory_items (variant/SKU)
                                   │                                        ├── item_barcodes · item_uom_conversions
                                   │                                        └── stock_movements (ledger)
                                   ├── stock_adjustments · stock_counts · stock_transfers (+ items)
                                   ├── suppliers ── purchase_orders ── goods_receipts ── supplier_bills
                                   │             └── supplier_payments · debit_notes · supplier_ledger
                                   ├── quotes (+ ordered stage, store, price_list, per-line tax)
                                   │     ├── quote_items (+ uom, tax_category, variant snapshot, delivered/returned qty)
                                   │     ├── deliveries (DC) ── delivery_items
                                   │     ├── credit_notes ── credit_note_items
                                   │     └── invoice_payments (V1, now fed by receipt-voucher allocations)
                                   ├── receipt_vouchers ── receipt_allocations · cheques
                                   ├── customer_ledger · statement_runs · statement_tokens
                                   ├── recurring_invoices ── recurring_invoice_items · billing_runs
                                   └── print_templates
```

---

## 4. PHASES

Each phase lists its **Goal**, **Deliverables**, **Database migration outline**, **Affected / new files** and **Checkpoint** (in addition to §0.3).

---

### PHASE 16 · Rebranding to ProductLogik POS, Repo & Project Rename  *(M1)*

**Goal**: everything a user, customer or developer sees says ProductLogik POS, in the ProductLogik emerald identity. No behaviour changes.

**Recommended features (offered when this phase starts, §10)**: RF-16.1 Organization accent colour on documents · RF-16.2 Urdu-ready fonts · RF-16.3 "What's new" panel · RF-16.4 Dark mode with a theme switcher (added by the product owner during the phase). **All four accepted.**

**Deliverables**
1. **Repository rename** (outward-facing — done only after explicit confirmation in this phase):
   - `gh repo rename productlogik-pos --yes` (GitHub redirects the old URL), then `git remote set-url origin https://github.com/hamzi207/productlogik-pos.git`, `git remote -v` + `git fetch` to confirm.
   - The local folder `D:\SpicedProjects\Projects\carshop_pos` is **not** renamed in this phase (it would break the Claude project memory path and any open terminals); offered as an optional manual step at the end.
2. **Project metadata**: `package.json` / `package-lock.json` `"name": "productlogik-pos"`, `"version": "2.0.0-alpha.0"`; `src/app/layout.tsx` metadata (title template `%s · ProductLogik POS`, description, `applicationName`, `themeColor`), `manifest` (new `src/app/manifest.ts`: name, short name "ProductLogik", icons, emerald theme colour — makes the app installable on phones and tablets).
3. **Logo & favicon suite** from `productlogik/assets/logo.svg` (emerald gradient rounded square + white lightning bolt `M13 10V3L4 14h7v7l9-11h-7z`). The SVG and the 400px PNG are copied unchanged. The other sizes are straight resizes of that SVG, except the maskable icon, which is full-bleed with the bolt in the safe zone. The ProductLogik repo has no favicon set to take:
   - `public/brand/mark.svg` (the square mark), `mark-mono.svg` (single-colour bolt for thermal printing / dark surfaces), `logo-horizontal-light.svg` / `logo-horizontal-dark.svg` (mark + "ProductLogik POS" wordmark), PNG fallbacks for email (Resend) and react-pdf.
   - `src/app/icon.svg`, `src/app/apple-icon.png` (180), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon.ico` (16/32/48).
   - Remove `public/brand/logo-black.png`, `logo-white.png`, `mark.png`, and the `carshop_logo/` folder (kept in git history and tag `v1.0.0`). Also delete unused Next starter SVGs in `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) if nothing references them.
4. **Theme tokens** (`src/app/globals.css` `:root`; the dark values are deliverable 9):
   - New brand ramp: `--brand-50 #ecfdf5`, `--brand-100 #d1fae5`, `--brand-200 #a7f3d0`, `--brand-300 #6ee7b7`, `--brand-400 #34d399`, `--brand-500 #10b981`, `--brand-600 #059669` (primary), `--brand-700 #047857` (hover / text on light), `--brand-800 #065f46`, `--brand-900 #064e3b`; `--brand-gradient: linear-gradient(135deg, #059669, #34d399)`.
   - The V1 accent aliases (`--blue`, `--blue-dark`, `--blue-soft`, `--brand-red`) are **replaced** by `--accent-brand*` names in one sweep across `globals.css` and components (they currently mean "brand red", which is now misleading). `accent-color`, focus rings, active nav, primary buttons, selected pills, the admin navbar's 3px rule and the PDF/share accents move to emerald.
   - Neutrals switch from the V1 zinc greys back to **slate** (`#0f172a … #f8fafc`) to match ProductLogik's slate surfaces.
   - **Semantic colours are separated from the brand**: success can no longer be the brand green alone (paid / in-stock badges get a distinct teal-on-white or icon + text so "brand" and "success" don't blur); danger stays rose (`#e11d48`) — no red anywhere means "brand" any more; info stays blue; warning amber.
   - Contrast check: white on `#059669` is 3.8:1 (fails AA for small text) → primary buttons use `#047857` (5.5:1) background with `#059669` for large marks/hover rings. Verified with a contrast script for every token pair used for text.
5. **Typography**: `next/font/google` **Plus Jakarta Sans** (400/500/600/700, variable `--font-sans`) replacing Inter; tabular numbers (`font-variant-numeric: tabular-nums`) on money/quantity columns so figures line up in tables and documents.
6. **Copy & names**: every "CarShop", "CarShop.Pk", "car shop", "parts", "auto shop" in UI, emails, PDFs and docs → "ProductLogik POS" / "shop" / "products" (19 source files reference carshop today, e.g. `brand.tsx`, `app-sidebar.tsx`, `login-form.tsx`, `(auth)/layout.tsx`, `admin-navbar.tsx`, `document-pdf.tsx`, `thermal-receipt.tsx`, `email/client.ts`, `email/templates/account.ts`, `actions/auth.ts`, `actions/team.ts`, `share/[token]/page.tsx`). "Part" wording in inventory/document screens → "Product/Item" (the automotive word "part" returns only when the fitment module is on, Phase 18). `RESEND_FROM_EMAIL` default → `ProductLogik POS <onboarding@resend.dev>`.
7. **Internal identifiers** (decision 10): `x-productlogik-impersonation` header + `productlogik_impersonation` cookie, with the old names still accepted; `__productlogikLeaveGuard`. Migration updates `private.impersonated_tenant_id()` to read either header.
8. **Docs**: `README.md` rewritten for ProductLogik POS (logo, features, setup), `PROJECT_SPEC.md` title/vision/§2.1 scope matrix updated for multi-industry inventory, invoicing and billing (Version 1 history in §7 untouched), `FOUNDER_SETUP_GUIDE.md` / `MAC_SETUP_CHECKLIST.md` repo URLs, `docs/regression-checklist.md` created.
9. **Dark mode with a theme switcher** (RF-16.4):
   - **Choice**: Light · Dark · System (follows the device). It's remembered per browser through `next-themes` (`attribute="class"`, no flash on load, no database column). The default is System.
   - **Switcher** in the user menu (top bar), so it's on every app screen and in `/admin`. The sign-in pages follow the saved choice.
   - **Tokens**: a `.dark` block in `globals.css` redefines the surface, text, border and slate tokens. The emerald brand, teal success, rose danger, amber warning and blue info get dark-surface variants. Hard-coded colours in rules (`#fff`, tints, shadows) move onto tokens so they flip too. Native controls get `color-scheme: dark`.
   - **What stays light**: the A4 PDF, the POS slip (on screen and printed), the customer share page and emails. These are documents and print on white paper.
   - **Contrast**: `scripts/check-contrast.mjs` checks the dark pairs to AA as well.
   - **Superadmin parity**: the theme is a per-browser display preference, not an organization setting, so there's nothing for the superadmin to manage.
10. **Document colour** (RF-16.1): `tenants.accent_color` (`#rrggbb`, null = ProductLogik emerald `#047857`) is set in Settings → Profile with 8 presets, a colour picker and a hex field. The superadmin edits it on the organization page (parity). The app rejects colours below 4.5:1 on white (`src/lib/accent.ts`). It's used for the A4 PDF's header rule, title and bank card, the share page accents, and the email top bar and buttons. Balance due stays rose and the POS slip stays black.
11. **Urdu-ready fonts** (RF-16.2): on screens, Noto Sans Arabic is the fallback after Plus Jakarta Sans. It only downloads for Arabic-script text. Nastaliq was dropped because its tall line height breaks table rows and inputs. The A4 PDF and POS slip PDF register Noto Sans Arabic (`src/assets/fonts`, SIL OFL) as the fallback after Helvetica; react-pdf 4.9 was tested to join the letters and order them right to left. The browser-printed slip gets the same fallback.
12. **What's new** (RF-16.3): `src/lib/changelog.ts` entries, a top-bar gift button with a dot until the latest entry is opened, and a panel (dialog on desktop, bottom sheet on phones). What each user has seen is stored in `profiles.whats_new_seen`.

**Migration outline** — `20261019202258_phase16_brand_accent_whats_new.sql`: `private.impersonated_tenant_id()` reads `x-productlogik-impersonation` then `x-carshop-impersonation`. It adds `tenants.accent_color` (RF-16.1) and `profiles.whats_new_seen` (RF-16.3), each with a check constraint and a column-level update grant.

**Affected files**: `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/app/manifest.ts` (new), `src/app/icon.svg` (new), `src/app/globals.css`, `src/components/shared/brand.tsx`, `app-sidebar.tsx`, `sidebar-toggle.tsx`, `notification-bell.tsx`, `src/components/auth/*`, `src/app/(auth)/layout.tsx`, `src/app/admin/*`, `src/components/admin/admin-navbar.tsx`, `src/components/pdf/*`, `src/app/share/[token]/page.tsx`, `src/lib/email/**`, `src/lib/actions/auth.ts`, `team.ts`, `src/lib/supabase/impersonation-header.ts`, `server.ts`, `middleware.ts`, `src/lib/hooks/use-leave-guard.ts`, `src/components/shared/theme-*.tsx` + `user-menu.tsx` (dark mode), `public/**`, `carshop_logo/` (deleted), `README.md`, `docs/*`.

**Checkpoint**: `grep -ri carshop src public` returns nothing but the dual-read fallbacks; contrast report passes AA; screenshots of login, dashboard, document, POS slip, A4 PDF, share page, admin, email template; the app screens (dashboard, lists, document editor, settings, admin, dialogs and sheets on phones) in **light and dark**, with documents staying light; the dark-mode contrast pairs pass AA; the theme survives a reload with no flash; favicon/PWA install on Android Chrome; an impersonation session started before the deploy still works after it; GitHub shows `productlogik-pos` and `git push` works to the new URL.

---

### PHASE 17 · Superadmin Full Control Plane  *(M2)*

**Goal**: the superadmin is a true super admin. They can create, view, change and manage **every** organization, user, setting and element of the app, in any organization, without asking the organization. On top of that, they own the platform-wide data (industries, categories, vehicle catalog, defaults) and the **subscription plans** that decide what each organization pays and how many stores, users and products it gets (deliverable 9). Everything they do is audited. This phase builds the framework; every later phase plugs its own settings and elements into it (decision 13).

**Recommended features (asked 2026-10-20, §10)**: **accepted** RF-17.1 Two-factor sign-in for superadmins, RF-17.2 Organization notes, tags & follow-ups, RF-17.4 Organization health score (deliverables 10–12) · RF-17.3 Subscription tracking became deliverable 9 (Rev 6) · **declined** RF-17.5 "Login As" reason & transparency.

**Principles**
- **Superset of the organization admin**: anything an org admin can do in their organization, the superadmin can do in any organization. Things org admins can't do (industry, modules, categories, status, limits, archiving, global catalogs) are superadmin-only.
- **Two ways of working**, both audited:
  1. **From the console** (`/admin`): manage organizations, users and every setting without entering the organization.
  2. **"Login As" impersonation** (V1 Phase 13) for day-to-day data: inventory, documents, customers, suppliers, stock, ledgers. The superadmin works inside the organization with every permission. There's a new **read-only** mode for safe support viewing.
- **Same code, same rules**: console forms reuse the organization's own settings components and server actions with a target `tenantId` (the V1 `shopTarget()` pattern from Phase 13). There is one implementation per setting, so the superadmin's view and the org admin's view can never disagree, and database validation applies to both.
- **Safety**: destructive actions need a reason and typed confirmation. Organizations are archived, never deleted. Nothing ever shows passwords, PINs or tokens.

**Deliverables**
1. **Organization management** (`/admin/tenants`, extends V1):
   - Create Organization (V1), now with: industry (Phase 18), **subscription plan and billing cycle** (deliverable 9), modules, first store(s) (Phase 20), first admin (invite or temporary password), and optional extra users. *(Rev 12: from Phase 22 the first admin gets a username, password and notification email; no invite.)*
   - Edit everything on the organization: the full business profile (V1) and all settings (item 3).
   - Status active / trial / suspended (V1) with a reason shown to the organization's users.
   - **Limits** come from the organization's subscription plan (max users, max stores, max products, allowed modules). The superadmin can **override** any one of them for a single organization (e.g. one extra store for a valued customer) without making a new plan. They're enforced in SQL, and org admins see them read-only. Details in deliverable 9.
   - **Transfer ownership**: make another member the owner admin.
   - **Archive / restore** (organizations are **never permanently deleted**, as the product owner decided on 2026-10-20). Archiving needs a reason and typed confirmation of the organization name.
     - **What archiving does**: users can't sign in ("This organization has been archived"), scheduled jobs stop (statements, reminders, billing runs), and all data is kept. A full export (item 6) can still be downloaded.
     - **In the Shops list**: archived organizations are hidden by default. An **Archived** status pill shows them. Restoring brings everything back as it was.
     - **Archive-age colour**: in the superadmin's lists, an archived organization's **row background** changes colour every 30 days. It starts at light yellow on the day it's archived and reaches dark red after 12 steps (360 days ≈ one year), then stays dark red. Step = `min(12, floor(days archived / 30))`.
       - **Palette** (step: background / text): 0 `#FEF9C3` · 1 `#FEF08A` · 2 `#FDE68A` · 3 `#FCD34D` · 4 `#FDBA74` · 5 `#FB923C` · 6 `#F97316` · 7 `#EA580C` · 8 `#EF4444` with dark slate text; 9 `#DC2626` · 10 `#B91C1C` · 11 `#991B1B` · 12 `#7F1D1D` with white text. Each pair is checked for WCAG AA contrast.
       - **Where**: the Shops table rows and the phone cards (as a card background).
       - **Reading it**: a small "Archived 4 months ago" label sits on the row, and a colour legend sits above the list. There's also a sort by "archived longest".
       - **Calculation**: the colour is computed from `archived_at` at render time (in the shop timezone of the superadmin view), so no job is needed. Restoring clears it, and re-archiving starts again at light yellow.
2. **User management across all organizations** (`/admin/users` and the organization's **Users** tab; extends V1 Phase 13/14):
   - **Create a user directly in any organization**: name, email, role (Phase 22 roles), stores they can work in (Phase 20), and either an invite email or a temporary password shown once. Bulk create from CSV. *(Rev 12: from Phase 22, a username and the password the superadmin sets; email only for admins, for notifications.)*
   - **Edit** name, email (with re-verification), role, stores and default store.
   - **Passwords & access**: reset link (V1), temporary password (V1), **reset approver PIN** (Phase 22), **force sign-out** (revoke all sessions).
   - **Lifecycle**: deactivate / reactivate (V1 Phase 14), resend / cancel invite *(until Phase 22, Rev 12)*, **remove from organization / delete account** (their documents stay, attributed to "former member").
   - View last sign-in, recent activity and email log per user.
   - V1 safety rules stay: an organization always keeps an active admin, and a superadmin can't lock themselves out.
   - **Platform team**: grant / revoke superadmin to other platform users. Only superadmins can do it, the last superadmin can't be revoked, and it needs typed confirmation and is audited. Superadmins are listed on an `/admin/team` page.
3. **Every organization setting, in the console** (organization page tabs):
   - **Tabs**: Overview · Profile · Localization · Documents & numbering · Printing · Tax · Stores · Users & roles · Subscription · Modules & limits · Categories · Units & lists · Credit & statements · Billing · Data · Activity. (**Subscription** is what the organization pays ProductLogik, deliverable 9; **Billing** is the organization's own recurring billing of its customers, Phase 31.)
   - Each tab renders **the same form the organization sees**, saving to that organization, with a before/after audit row.
   - The tabs for later phases appear as those phases are built; each phase's checkpoint includes "the superadmin can change it from the console" (§0.3).
   - **Settings parity map** (which phase adds each area to the console):

| Settings area | Org admin | Superadmin | Added in |
| :--- | :---: | :---: | :--- |
| Profile, logo, bank details, terms, numbering, print format, tax, localization, dashboard clock (V1) | ✓ | ✓ | 17 |
| Team / users, roles (V1) | ✓ | ✓ (+ create users directly, delete, superadmin grants) | 17 |
| Status, archive / restore, ownership | — | ✓ | 17 |
| Subscription plan, billing cycle, price, limit overrides, subscription invoices and payments | read only (+ submit payment proof) | ✓ | 17 |
| Industry, modules, categories (incl. org-specific & hidden), category requests | read / request | ✓ | 18 |
| Units of measure, customer types | ✓ | ✓ | 19 |
| Stores, cross-store invoicing settings | ✓ | ✓ | 20 |
| Permission overrides, discount limit, approval thresholds, approver PIN resets | ✓ (own PIN only) | ✓ | 22 |
| Barcode prefix / sequence, label templates, SKU patterns | ✓ | ✓ | 23 |
| Stock adjustment reasons, approval value limit | ✓ | ✓ | 24 |
| Purchasing defaults (PO terms, reorder rules) | ✓ | ✓ | 25 |
| Document flow, stock-out point, tax categories, further tax, price lists | ✓ | ✓ | 26 |
| Print templates per document type, header fields, slip options | ✓ | ✓ | 27 |
| Credit-note policy | ✓ | ✓ | 28 |
| Credit-limit policy, payment accounts, cheque settings | ✓ | ✓ | 29 |
| Statement schedules, reminder rules | ✓ | ✓ | 30 |
| Recurring billing defaults | ✓ | ✓ | 31 |

4. **Impersonation upgraded** (V1 Phase 13 design kept):
   - While impersonating, the superadmin has **every permission** (`private.has_permission()` returns true), so nothing is greyed out.
   - Actions that need manager approval are auto-approved and recorded as "approved by superadmin".
   - **Read-only mode** (a choice on "Login As"): every write is refused in the proxy (non-GET requests) and in security-definer RPCs (`private.assert_writable()`). The banner shows "Read-only".
   - The session length is a platform setting (default 2h, V1).
5. **Platform settings & global data** (`/admin/platform`):
   - **Global catalogs**: industries and category catalogs (built in Phase 18), and the **vehicle catalog** (search, add, edit, merge duplicates, deactivate YMM rows in the global `vehicles` table; today this is only possible with scripts).
   - **Defaults new organizations start with**: units of measure, tax categories, customer types, stock adjustment reasons, payment methods, document terms text, numbering prefixes, and the **default permission matrix** (`private.role_permissions`).
   - **New organizations**: default status (active / trial), default industry, **default plan and trial length** (deliverable 9). *(Rev 8: the self-registration switch was removed; the superadmin creates every organization.)*
   - **Payment instructions**: the mobile wallet accounts (JazzCash, Easypaisa, others: account title and number) and bank accounts (bank, account title, account number, IBAN) organizations pay into. They're printed on subscription invoices and shown on the organization's Subscription page (deliverable 9).
   - **Email**: sender name and reply-to default, per-organization hourly limit (V1: 100), the email log across organizations (V1 table) with resend.
   - **Announcements**: a banner message to all organizations or chosen industries/organizations, with dates (e.g. maintenance).
6. **Data tools per organization** (Data tab):
   - **Full export**: a ZIP of CSVs + JSON for every table of the organization + storage files.
   - **Imports on its behalf**: inventory CSV (V1), customers, suppliers, opening balances.
   - **Health checks**: run the stock and balance reconciliation (Σ store stock = item total, ledger = balances, ledger sums = stock) and show any differences.
   - **Superadmin overrides** with reason + typed confirmation, for support cases: delete a document that has payments (reverses them), reopen a cancelled document, correct a stock figure through an audited adjustment. Each override is listed in the audit log.
7. **Audit log viewer** (`/admin/audit`): every superadmin action and impersonated request (V1 tables), filtered by organization, user, action and date, with before/after details and a CSV export. Each organization's **Activity** tab shows its slice.
8. **Cross-organization overview** (extends the V1 Overview): organizations by industry/status, users, stores, documents, pending category requests, organizations near their limits.
9. **Subscription plans & manual payments** (added in Rev 6; replaces RF-17.3). Organizations pay ProductLogik by **mobile wallet or bank transfer only**. There's no gateway, card or automatic charging. The superadmin decides each organization's plan.
   - **Plans** (`/admin/plans`, superadmin only). **Plans are data, not code**: the superadmin creates as many plans as needed from the console, at any time, with no developer or deploy involved (the product owner's requirement, 2026-10-20, because client needs in Pakistan vary a lot).
     - Create, edit, duplicate and retire plans. Each plan has a name (e.g. Starter, Business, Enterprise), an internal code, a short description and a display order.
     - **Prices per billing cycle** in PKR: **monthly and yearly only** (the product owner's decision, 2026-10-20). The superadmin fills in either or both; a plan may offer just one.
     - **Limits**: max stores, max users (active members; deactivated ones don't count), max products (active inventory items), and the allowed modules (e.g. Vehicle Fitment, Phase 18). Any limit can be left empty for "unlimited".
     - **Trial days** (e.g. 14) used when the plan starts as a trial.
     - **Visibility**: *standard* plans can be chosen as the sign-up default and appear in lists; *custom* plans are for one negotiated deal and are hidden from the default list.
     - **Retire, never delete**: a retired plan can't be assigned to new organizations, but organizations already on it keep it until the superadmin moves them. The list shows how many organizations are on each plan.
     - **Editing a plan**: changing its **limits** applies to every organization on it at once (with a warning listing the organizations that would end up over a limit). Changing its **price** applies only from each organization's next invoice, because every subscription stores the price it was sold at.
   - **Assigning a plan to an organization** (organization page → **Subscription** tab, and in Create Organization):
     - Plan, billing cycle, start date, and whether it starts as a **trial** or **active**.
     - **Agreed price**: the plan price by default, or a custom price or a discount (amount or %) with a note, e.g. "launch discount until Dec".
     - **Limit overrides**: optional per-organization values for stores, users, products and modules. The effective limit is the override if set, otherwise the plan's. The tab shows both, plus current usage (e.g. "Users 4 / 5").
     - **Grace days** after the due date (default 7, from platform settings), and **auto-suspend when unpaid** on/off (default on).
     - **Make a custom plan from here**: when a client doesn't fit any existing plan, "Create custom plan for this organization" opens the plan form pre-filled from its current plan. The superadmin changes the price, cycles or limits, saves it as a new *custom* plan (optionally named after the client) and assigns it in the same step. It can later be made *standard* so other clients can use it too.
     - **Change plan** (upgrade or downgrade) takes effect immediately or from the next period, as the superadmin chooses. There's no automatic proration: the superadmin can add a one-off **adjustment line** (charge or credit) to the next invoice. Unpaid invoices (without a payment being checked) are voided and reissued at the new price, so a downgraded organization pays the lower tier.
     - **Downgrades never delete data automatically**. The Change Plan dialog lists what the organization has beyond the new plan's limits; the superadmin then brings it in line (deactivates users, removes products, switches off modules) or gives an override. Until it's back under the limit it can't add more (new users, stores or products), and its admins see a banner explaining why. If no existing plan fits, the superadmin uses "Create custom plan for this organization" (below).
     - **Cancel subscription**: the organization stays usable until the end of the paid period, then becomes suspended ("Subscription ended"). This is separate from archiving.
     - Every change keeps a **history row** (plan, cycle, price, limits, who, when, reason), shown on the tab.
   - **Subscription invoices** (what ProductLogik bills the organization; separate from the organization's own documents):
     - Numbered on the platform's own series, e.g. `PLS-2026-0001`, with the plan, period (from–to), agreed price, discount, adjustment lines and total.
     - **Created automatically** a set number of days before each period starts (default 7, platform setting) by a daily `pg_cron` job, and also on demand ("Create invoice now").
     - The PDF uses the ProductLogik business details and shows the **payment instructions** (wallet and bank accounts, deliverable 5) and the invoice number as the payment reference.
     - Emailed to the organization's owner admin and shown on their Subscription page. Status: *unpaid*, *paid*, *void* (void needs a reason).
   - **Recording payments** (superadmin):
     - **Record payment** on an invoice: date, amount, method (JazzCash, Easypaisa, other mobile wallet, bank transfer, cash), the transaction ID / reference, the sender's name or account, an optional screenshot or receipt file, and a note.
     - **No part payments** (the product owner's decision, 2026-10-21): a payment always covers the invoice's full amount due, whether the superadmin records it or the organization reports it. It's enforced in SQL. When an invoice is paid, the subscription's **paid-until date moves forward by one period**, and a suspended-for-non-payment organization is **reactivated automatically**.
     - A payment can be reversed (with a reason), which reopens the invoice.
     - A **payment receipt** PDF is emailed to the owner admin.
   - **Payment proof from the organization** (org admin, `/settings/subscription`):
     - The organization sees its plan, limits and usage, the paid-until date, its invoices, and the payment instructions. It can't change its plan here; there's a **"Request a plan change"** button that notifies the superadmin.
     - **"I've paid"**: the admin enters the amount, method, transaction ID and date, and uploads a screenshot. This creates a *pending* payment. The superadmin gets an email and a "Payments to verify" count in the console.
     - The superadmin **verifies** it (it becomes a recorded payment, as above) or **rejects** it with a reason the admin can read.
     - Screenshots go to a private storage bucket that only the organization's admins and the superadmin can read.
   - **Renewals, reminders and suspension** (daily `pg_cron` job, idempotent, skips archived organizations):
     - Reminder emails to the owner admin 7 and 3 days before the due date, on the due date, and when the grace period starts. A banner in the app shows the same message to admins ("Your subscription is due on 1 Nov. Invoice PLS-2026-0042").
     - After the due date: the subscription is **past due** (the banner turns red).
     - After the grace days, with auto-suspend on: the organization is **suspended** with the reason "Subscription unpaid" (the V1 suspended cut-off), and its users see a page with the amount due and the payment instructions instead of the app. Admins can still open the Subscription page to submit payment proof.
     - Trials end the same way: when the trial days run out without a paid invoice, the organization follows the past-due → grace → suspend path.
     - The superadmin can always **extend** a due date or trial by hand (with a reason), or turn auto-suspend off for one organization.
   - **Billing overview** (`/admin/billing`):
     - Lists of organizations due this week, past due, in grace, suspended for non-payment, and on trial ending soon.
     - **Payments to verify** queue.
     - Collected this month and last month, expected monthly revenue (MRR, from active subscriptions), and revenue per plan.
     - CSV export of invoices and payments.
   - **Three starting plans** are seeded by the migration as *standard* plans. They're only a starting point: the superadmin can edit, duplicate or retire them from the console like any other plan. The yearly prices were set by the product owner on 2026-10-20 (PKR 12,000 / 18,000 / 26,000). The monthly price is derived from it (yearly ÷ 10). The limits are placeholders to confirm.

     | Plan | Monthly | Yearly | Stores | Users | Products | Modules | Trial |
     | :--- | ---: | ---: | :---: | :---: | :---: | :--- | :---: |
     | **Starter** | PKR 1,200 | PKR 12,000 | 1 | 3 | 1,000 | all available | 14 days |
     | **Business** | PKR 1,800 | PKR 18,000 | 3 | 10 | 10,000 | all available | 14 days |
     | **Enterprise** | PKR 2,600 | PKR 26,000 | 10 | 30 | unlimited | all available | 14 days |

     Yearly is 2 months free compared with paying monthly. **Starter** is the default plan for self-sign-ups (platform setting).
   - **Existing organizations**: the migration creates a **"Founding" custom plan** (price 0, no limits) and puts every existing organization on it as active with no due date, so nothing changes for them until the superadmin assigns a real plan.
   - **Enforcement in SQL**:
     - `private.tenant_limit(p_tenant, p_kind)` returns the effective limit (override, else plan).
     - Triggers refuse the next insert or reactivation beyond the limit: users (`profiles` activation and invites), products (`inventory_items`, including CSV import, which reports the rows it couldn't add), and stores once `stores` exists (Phase 20 adds that trigger).
     - Modules outside the plan can't be switched on (Phase 18 reads `private.tenant_has_module()`).
     - The superadmin bypasses limits only through an explicit override, never silently.
10. **Two-factor sign-in for superadmins** (RF-17.1):
   - Authenticator-app (TOTP) codes through Supabase Auth MFA. Every superadmin must enrol before `/admin` opens: the first visit shows a QR code and a code box, then the console.
   - After that, each sign-in asks for the 6-digit code. The console and every superadmin server action and route require an `aal2` session (`private.is_superadmin()` checks the JWT `aal` claim), so a stolen password alone can't reach the console.
   - Organization users are unchanged (no 2FA required).
   - Lost phone: another superadmin can reset a superadmin's 2FA from `/admin/team` (audited). If there's only one superadmin, the reset is a documented service-role script in `docs/`.
11. **Organization notes, tags & follow-ups** (RF-17.2), superadmin only, never visible to the organization:
   - **Notes**: a timeline of private notes on the organization's Overview tab (who, when; editable by the author, deletable with a reason).
   - **Tags**: free tags with a colour (e.g. VIP, Onboarding, Fees due), managed at `/admin/platform` and attached on the organization page.
   - **Follow-ups**: a date plus a short reason, marked done when handled. The console Overview lists follow-ups due today and overdue.
   - The Shops list filters by tag and by "follow-up due", and shows the tags on each row and phone card.
12. **Organization health score** (RF-17.4):
   - A score of 0–100 per organization from the last 30 days: active users who signed in, documents created per week, and setup completeness (business profile, logo, at least one product, one customer and one invoice). It's shown as Healthy / Watch / At risk with the parts that make it up.
   - Computed by one SQL function (`private.tenant_health(p_tenant)`), refreshed by the daily job into `tenant_health_snapshots`, so the Shops list can sort by it without a heavy query, and the organization page shows the trend.
   - Archived organizations have no score.

**Migration outline** — `…_phase17_superadmin_full_control.sql`:
- `tenants`: `owner_id`, `archived_at`, `archived_by`, `archive_reason`, `status_reason`. `private.current_tenant_id()` returns null for an archived organization, like a suspended one. Not granted to `authenticated`.
- **Subscriptions** (deliverable 9):
  - `subscription_plans` (*global*, superadmin only): `name`, `code` unique, `description`, `visibility` ('standard' | 'custom'), `price_monthly`, `price_yearly` (null = cycle not offered; at least one required), `max_stores`, `max_users`, `max_products` (null = unlimited), `allowed_modules text[]`, `trial_days`, `sort_order`, `retired_at`.
  - `tenant_subscriptions` (one current row per tenant, read-only to the tenant's admins): `plan_id`, `billing_cycle` ('monthly' | 'yearly'), `status` ('trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'; the grace period is past_due until `next_due_date` + `grace_days`), `agreed_price`, `discount_type`, `discount_value`, `price_note`, override columns `max_stores`, `max_users`, `max_products`, `allowed_modules`, `started_at`, `trial_ends_at`, `paid_until`, `next_due_date`, `grace_days`, `auto_suspend`, `cancel_at`.
  - `tenant_subscription_history` (append-only: before/after jsonb, reason, by, at).
  - `subscription_invoices` (+ `subscription_invoice_lines`): platform-wide number series, `tenant_id`, period from/to, amounts, `status`, `void_reason`; unique per tenant + period so the job can't double-bill.
  - `subscription_payments`: `invoice_id`, `amount`, `paid_on`, `method` ('jazzcash' | 'easypaisa' | 'other_wallet' | 'bank_transfer' | 'cash'), `reference`, `payer_name`, `proof_path`, `status` ('pending' | 'verified' | 'rejected' | 'reversed'), `submitted_by`, `verified_by`, `reason`.
  - Private storage bucket `subscription-proofs` (path `tenant_id/…`), readable by that tenant's admins and the superadmin.
  - `platform_settings` gains the payment instructions (wallet and bank accounts), the invoice lead days, default grace days, the default plan and trial for sign-ups, and the reminder schedule.
  - `private.tenant_limit(p_tenant, p_kind)`, `private.tenant_has_module(p_tenant, p_module)`, and limit triggers on `profiles` and `inventory_items` (the `stores` trigger is added in Phase 20).
  - Org-admin RPC `submit_subscription_payment(...)` (creates a *pending* payment only). Service-role RPCs `admin_assign_plan`, `admin_change_plan`, `admin_cancel_subscription`, `admin_create_subscription_invoice`, `admin_record_subscription_payment`, `admin_verify_subscription_payment`, `admin_reverse_subscription_payment`, `admin_extend_subscription`.
  - `run_subscription_cycle(p_date)` for the daily `pg_cron` job: create invoices, send reminders, move statuses, suspend, and reactivate on payment. Idempotent per day.
  - **RF-17.1**: `private.is_superadmin()` also requires `auth.jwt()->>'aal' = 'aal2'`; nothing is stored beyond Supabase's own `auth.mfa_factors`.
  - **RF-17.2**: `tenant_notes` (tenant_id, body, author, edited_at, deleted_reason), `admin_tags` (*global*: name, colour), `tenant_tags` (tenant_id, tag_id), `tenant_follow_ups` (tenant_id, due_on, reason, done_at, done_by). All service role only.
  - **RF-17.4**: `private.tenant_health(p_tenant)` and `tenant_health_snapshots` (tenant_id, taken_on, score, parts jsonb), written by the daily job.
  - Seed: the Starter, Business and Enterprise standard plans (table in deliverable 9), and the "Founding" custom plan with every existing tenant on it. `platform_settings.default_plan_id` = Starter.
- `platform_settings` (*global*, single row, service role only): sign-up rules, default industry/status, impersonation TTL, email defaults, announcement defaults.
- `platform_defaults` (*global*: kind, payload jsonb) for the lists new organizations start with; `announcements` (*global*, readable by the targeted organizations).
- `impersonation_sessions.mode` ('full' | 'read_only'); `private.impersonation_mode()`; `private.assert_writable()` called at the top of every security-definer write RPC (V1 RPCs updated).
- `private.is_superadmin_session()`. `private.has_permission()` returns true when it's true (prepared here; Phase 22 adds the permission table).
- Service-role RPCs: `admin_tenant_detail` (extended), `admin_export_tenant`, `admin_archive_tenant`, `admin_restore_tenant`, `admin_set_superadmin(p_user, p_grant)` (refuses the last one), `admin_reconcile_tenant(p_tenant)`.
- `superadmin_audit_logs` (V1) gains an index `(target_tenant_id, created_at desc)` and a `reason` column.

**Affected files**:
- **New (admin)**: `src/app/admin/tenants/[id]/` becomes a tabbed layout (`layout.tsx` + one route per tab); `src/app/admin/platform/**`, `src/app/admin/audit/*`, `src/app/admin/team/*`; `src/components/admin/tenant-tabs.tsx`, `tenant-limits-form.tsx`, `tenant-danger-zone.tsx` (archive / restore / ownership), `src/lib/archive-colour.ts` (step + palette, unit-tested), `create-user-dialog.tsx`, `bulk-users-import.tsx`, `platform-settings-form.tsx`, `defaults-editor.tsx`, `vehicle-catalog-manager.tsx`, `announcement-manager.tsx`, `audit-log-table.tsx`, `data-tools.tsx`.
- **New (subscriptions)**: `src/app/admin/plans/**`, `src/app/admin/billing/**`, the organization's `subscription` tab route; `src/app/(dashboard)/settings/subscription/page.tsx`; `src/components/admin/plan-form.tsx`, `plan-list.tsx`, `tenant-subscription-panel.tsx`, `record-payment-dialog.tsx`, `verify-payment-dialog.tsx`, `billing-overview.tsx`; `src/components/subscription/subscription-summary.tsx`, `submit-payment-dialog.tsx`, `subscription-banner.tsx`, `suspended-unpaid-page.tsx`; `src/components/pdf/subscription-invoice-pdf.tsx`, `subscription-receipt-pdf.tsx`; `src/lib/actions/admin/subscriptions.ts`, `src/lib/actions/subscription.ts`; `src/lib/subscription.ts` (effective limits, status and due-date maths, unit-tested); email templates for invoice, reminder, receipt, payment rejected and suspension; `src/app/api/cron/subscriptions/route.ts` (secret-protected, if the job sends email through the app).
- **Changed**:
  - `src/lib/actions/admin.ts` (split into `src/lib/actions/admin/*.ts`).
  - **Every settings action** in `src/lib/actions/settings.ts`, `team.ts`, `categories.ts`… takes an optional `tenantId` through one shared `resolveTarget()`: the own organization via RLS, or any organization for a superadmin via the service role + audit (generalising V1 `shopTarget()`).
  - **Every settings component** accepts `tenantId`.
  - `src/lib/superadmin.ts`; `src/lib/supabase/middleware.ts` (read-only impersonation); `impersonation-banner.tsx`; `src/components/shared/announcement-banner.tsx` (new); `src/lib/auth.ts`.

**Checkpoint**:
- **Parity**: change each V1 settings tab from the console for a test organization; the organization sees each change, and each change has a before/after audit row.
- An org admin calling any console action (direct POST) is refused.
- **Users**: create a user into an organization with a role and a temporary password → they can sign in. Bulk CSV creates 10 users. Force sign-out ends a live session. Delete account keeps their documents.
- **Superadmin team**: grant/revoke superadmin works; the last superadmin is protected.
- **Read-only "Login As"**: every page is visible, and every write (form, server action, RPC) is refused.
- **Full "Login As"**: every action is available, and approvals are auto-recorded.
- **Limits**: the plan's max users and products block the next invite, activation, product or CSV row, in SQL as well. A per-organization override raises the limit for that organization only. Editing a plan's limits changes every organization on it.
- **Plans**: create, edit, duplicate and retire a plan. A retired plan can't be assigned but stays on its organizations. A price change shows only on the next invoice.
- **Subscription cycle**: with the daily job run for chosen dates in a rolled-back transaction, the invoice is created on lead day −7, reminders go out on days −7, −3 and 0, the status moves to past due and then grace, and the organization is suspended after the grace days. Re-running the same date creates nothing new. Auto-suspend off → no suspension.
- **Payments**: a recorded payment that covers the invoice marks it paid, moves paid-until forward one period and reactivates a suspended organization. A payment for less (or more) than the amount due is refused, in the console, on "I've paid" and in SQL. A reversal reopens it.
- **Payment proof**: an org admin submits a JazzCash reference with a screenshot → it's pending → the superadmin verifies it (the same result as recording a payment) or rejects it (the admin sees the reason). Another organization can't read the screenshot or the submission.
- **Downgrade**: moving an organization with 6 users to a 5-user plan keeps all 6 active, blocks a 7th invite and shows the over-limit banner.
- **No code needed for new plans**: from the console, create a new plan with its own price and limits and assign it; duplicate a plan; and use "Create custom plan for this organization" from a Subscription tab. All of these work immediately.
- The three seeded plans exist with the agreed figures, and Starter is the sign-up default.
- **2FA (RF-17.1)**: a superadmin without a factor is sent to enrolment; with a factor but an `aal1` session, every console page, server action and service-role RPC wrapper is refused until the code is entered. A wrong code is refused. Another superadmin can reset it (audited). Organization users sign in as before.
- **Notes, tags, follow-ups (RF-17.2)**: add/edit/delete notes; tag an organization and filter the Shops list by tag; a follow-up due today shows on the Overview and disappears when marked done. An org admin can't read any of it (RLS and direct POST).
- **Health score (RF-17.4)**: seeded organizations with no activity, some activity and full activity score At risk / Watch / Healthy; the Shops list sorts by score; the score parts add up.
- **Existing organizations** are on the Founding plan after the migration, with no limits, banners or due dates.
- Subscription invoice and receipt PDFs show the payment instructions and open correctly. The amounts are right with a discount and an adjustment line.
- **Archive → restore** works. Archived users can't sign in or call the API. Scheduled jobs skip archived organizations. The export ZIP opens with all tables. There's no delete path for organizations anywhere (UI or RPC).
- **Archive-age colour**: unit tests for days 0, 29, 30, 59, 180, 359, 360 and 800 → steps 0, 0, 1, 1, 6, 11, 12, 12. Contrast is checked for all 13 pairs. Browser: seeded organizations archived 0 / 3 / 6 / 12+ months ago show the right row and card colours at phone, laptop and 4K.
- Announcements show only to the targeted organizations.
- V1 Phase 13 suite (34 checks) passes.

---

### PHASE 18 · Industries & Superadmin-Managed Category Catalogs  *(M2)*

**Goal**: any industry can sign up and use the full POS. Categories become platform data that only the superadmin manages. Each organization sees only its own industry's categories and the categories the superadmin linked to that organization.

**Recommended features (offered when this phase starts, §10)**: RF-18.1 Custom product attributes per category · RF-18.2 Category images & colours · RF-18.3 Industry onboarding checklist.

**Principles** (decision 6):
- **Every feature works for every industry.** Inventory, invoicing, delivery challans, variants, barcodes, purchasing, credit notes, the customer ledger, statements of account, billing and reports don't depend on the industry. The industry decides only: the category catalog, default units of measure, starting settings, and which optional modules start switched on (only Vehicle Fitment today, for Automotive).
- **Categories are superadmin-only.** Organization admins, managers and staff can browse and use categories but can't create, rename, move or delete them.
- **What an organization sees** = its industry's catalog (minus anything the superadmin hid for that organization) + categories the superadmin made for that organization only. Nothing from other industries, nothing from other organizations' own categories.

**Deliverables**
1. **Industries** (global, superadmin-managed, `/admin/industries`): name, slug, description, icon, sort order, active flag, default modules, default UOM codes, default settings (e.g. prices include tax, negative-stock policy). Starting list: the **14 launch industries in §11.1**: General Retail & Departmental Stores; Supermarket, Grocery & Kiryana; Wholesale & FMCG Distribution; Apparel & Footwear; Textile, Fabric & Cloth Houses; Electronics, Mobile Phones & Accessories; Computers & IT Equipment; Pharmacy & Medical Supplies; Cosmetics, Beauty & Personal Care; Hardware, Building Materials & Sanitary; Electrical & Lighting; Automotive Accessories & Parts; Books, Stationery & School Supplies; Toys, Gifts & Party Supplies. The superadmin can add industries later without code changes. An industry that has organizations can be closed for new organizations (not offered in Create Organization) but not deleted.
2. **Organization ↔ industry**: every tenant has one `industry_id` (required). An organization that sells across industries uses organization-specific categories (item 4); linking extra industry catalogs is a later item (RF-18.4).
   - **Superadmin Create Organization** (`/admin/tenants`) picks the industry (open industries only). There is no self sign-up (Rev 8).
   - **Changing an organization's industry** is superadmin-only (shop page in `/admin`), through a **re-mapping wizard**: every item whose category isn't in the new catalog gets mapped to a new category. The wizard auto-matches by full path, then by name, and the superadmin picks the rest or uses a fallback category. The change can't be saved until every item is mapped, and it's audited.
   - Org admins see the industry read-only in Settings → Profile.
3. **Category catalog editor** (`/admin/categories`, superadmin only): pick an industry → tree editor (the V1 `category-manager.tsx` moved into the admin console). Search, expand, add, rename, move to another parent, reorder, at most 4 levels.
   - Each category also gets a `sku_prefix` and an `icon`. Both are hard-coded per automotive main category in `src/lib/categories.ts` today; they move into columns.
   - Usage counts across organizations. A category in use can be **archived** (hidden from pickers, kept on existing items and documents) but not deleted.
   - **Duplicate tree** from another industry as a starting point; **import / export** the tree as CSV (path column, reusing `src/lib/csv.ts`).
   - Every change is a service-role server action behind `requireSuperadmin()` with an audit row (`category.create`, `category.rename`, `category.move`, `category.archive`, `category.restore`).
4. **Organization-specific categories** (superadmin, shop page → **Categories** tab):
   - The tab shows that organization's effective tree: industry catalog + its own categories, with item counts.
   - The superadmin can **add categories linked only to this organization** (e.g. a shop's house brand or a niche line), anywhere in the tree (under an industry category or as a new main category).
   - The superadmin can **hide** industry categories this organization doesn't use, so its pickers stay short.
   - Same audit trail as the catalog editor.
5. **Organization side (read-only)**:
   - Settings → Categories becomes a **read-only browser** (tree, search, item counts per category). The add / rename / delete controls are removed.
   - **"Request a category"** form (name, suggested parent, note) creates a request. The superadmin is notified (notification bell in `/admin` + email via Resend) and can approve it as an org-specific category, approve it into the industry catalog, or reject it with a reason. The requester sees the outcome in their notification bell.
   - Product dialog category picker, inventory filters, document part search chips and global search show only the organization's visible categories.
   - **CSV import**: an unknown category is a row error ("Not in your categories — request it from Settings → Categories"). Import never creates categories.
6. **Fitment module**: Vehicle Fitment is an optional module (decision 5).
   - It's switched on by default for organizations in Automotive Accessories. The superadmin can switch it on or off for any organization (shop page → Modules); org admins see it read-only.
   - When it's off, these are hidden: the inventory dialog's Universal Fit / Vehicle Specific + `ymm-compatibility-selector.tsx`, the fitment column and filter, vehicle search hits, the CSV `Universal` / `Vehicles` columns (ignored on import with a notice), `/api/vehicles` (403) and `add_vehicle`. `save_inventory_item` then treats every item as universal. Fitment data is kept, so switching the module back on restores it.
7. **Wording**: "parts" → "products" everywhere; "Universal fit" only appears in fitment organizations.
8. **How the other industries get their categories** (the automotive tree already exists in `docs/categories.md`):
   1. **Draft** (*done 2026-10-20, approved as-is 2026-10-21*: 13 files, 1,052 categories in total, in `docs/category-templates/`; see its README): Claude writes a starting tree for each of the 13 new launch industries (§11.1) in `docs/category-templates/<industry>.md`. It uses the same plain format as `docs/categories.md`: a main category, then `- ` for each level down, at most 4 levels, roughly 80–160 categories per industry, with SKU prefixes and icons noted per main category. The trees are tuned to how Pakistani shops in that trade group their stock. For example, **Supermarket & Grocery**: Fresh Produce › Fruits / Vegetables; Dairy & Eggs; Bakery; Rice, Flour & Pulses (Atta, Chawal, Daal); Cooking Oil & Ghee; Spices & Masala; Beverages › Tea / Juices / Soft Drinks; Snacks & Confectionery; Household & Cleaning; Personal Care; Baby Care. **Apparel & Footwear**: Men › Shalwar Kameez / Shirts / Trousers; Women › Unstitched / Stitched / Dupattas; Kids; Footwear; Accessories.
   2. **Review**: the product owner edits these files (add, rename, remove, reorder) before anything is seeded. This review is a pause point at the start of Phase 18.
   3. **Seed**: the approved files are loaded by the Phase 18 migration into the global catalog (`categories` rows with `industry_id`), the same way the automotive tree is.
   4. **Maintain afterwards**, without code or migrations, in `/admin/categories`:
      - edit any industry's tree in the console (add, rename, move, archive)
      - **import a tree from CSV** (path column, e.g. `Beverages › Tea › Green Tea`), with a preview of new / existing / problem rows before anything is saved, like the inventory CSV import
      - **duplicate** an existing industry's tree to start a new industry
      - **export** a tree to CSV, to edit in Excel and import again
   5. **Grow from real use**: category requests from organizations (item 5) can be approved straight into their industry's catalog, so the trees improve as organizations use them.
   6. **New industries later** (e.g. Furniture, Agriculture supplies): the superadmin adds the industry in `/admin/industries` and builds its tree with steps 4–5. No developer is needed.
9. **Custom product attributes** (RF-18.1, accepted 2026-10-21):
   - The superadmin defines attributes per **industry** (apply to every item) or per **category** (apply to items in that category and its children) in `/admin/categories` → Attributes. Each has a label, key, type (text, number, date, yes/no, list of options), required flag, "show on documents" flag and sort order. An organization-specific attribute can be added from the shop page → Categories tab.
   - Values live in `inventory_items.attributes jsonb` (keyed by attribute key), validated by a trigger against the definitions visible to the item.
   - They appear in the product dialog (under the category picker, changing with the category), as inventory filters (list and yes/no types), as CSV columns (`attr:<key>`), and on PDFs / slips under the line description when "show on documents" is on.
   - Archiving an attribute hides it from the dialog and filters but keeps stored values.
10. **Category images & colours** (RF-18.2, accepted 2026-10-21): each category can have a colour (from a fixed palette that reads in light and dark themes) and an optional image (public storage bucket `category-images`, 1 MB, PNG / JPG / WebP). They show in the category picker, the catalog editor, the org's read-only browser and category chips in inventory and document search. No colour or image → the icon as today.
11. **Industry onboarding checklist** (RF-18.3, accepted 2026-10-21):
   - Each industry has an ordered list of setup steps (edited in `/admin/industries`; default, 9 steps: business profile (address and phone), logo, bank or wallet details for invoices, products added or imported, opening stock, first customer, team invited, first quotation, first invoice). Steps for features from later phases (stores, opening balances) are added when those phases ship.
   - Progress is computed from the organization's own data, never ticked by hand. Org admins see a dismissible "Get started" card on the dashboard with a link per step; it disappears when every step is done.
   - The superadmin sees the same progress on the shop page Overview and as a "Setup %" column in the shops list.

**Migration outline** — `…_phase17_industries_categories.sql`:
- `public.industries` (*global*; RLS: any signed-in user reads active industries; no client writes. *(Rev 8: the anonymous `public.signup_industries()` was dropped with self sign-up.)*).
- `tenants.industry_id uuid not null references industries` (backfilled), `tenants.modules text[] not null default '{}'`. Both are left out of the `authenticated` column grants, so org admins can't change them.
- `categories`:
  - add `industry_id` (nullable) and `sku_prefix`, `icon`, `is_archived`, `created_by`.
  - `tenant_id` becomes **nullable**. Check: exactly one of `industry_id` / `tenant_id` is set. Catalog rows = industry set, tenant null. Org-specific rows = tenant set, linked to the tenant's industry tree through `parent_id` or as a root.
  - Unique name per parent within the same industry / tenant scope (case-insensitive, nulls not distinct).
  - Depth trigger kept. A parent must be in the same industry catalog, or (for org-specific rows) in the tenant's own industry catalog or its own categories.
- `tenant_hidden_categories (tenant_id, category_id)`.
- `category_requests` (tenant, requested_by, name, suggested_parent_id, note, status pending / approved_tenant / approved_industry / rejected, resolved_by, resolution_note, created_category_id, timestamps). RLS: org members read their organization's requests and insert them (rate-limited to 20 per day per organization); only the service role resolves them.
- **RLS on `categories`**: select = `(tenant_id is null and industry_id = private.current_industry_id() and not hidden for the tenant) or tenant_id = private.current_tenant_id()`. Archived rows stay readable so old items and documents still show their names; pickers filter them out. **No insert / update / delete policies for `authenticated`**: the V1 "Admins manage categories" policies (Phase 7, re-pointed to `private.is_shop_admin()` in Phase 13) are **dropped**. Superadmin writes go through the service role only.
- `private.current_industry_id()` (follows impersonation, like `current_tenant_id()`).
- **Item integrity**: V1 ties items to categories with a composite FK `(tenant_id, category_id)` → `categories (tenant_id, id)`, which can't point at global rows. It's replaced by a plain FK on `category_id` plus trigger `private.check_item_category`: an item's category must be visible to the item's tenant and not archived (archived is allowed only if the item already had it).
- **Data migration for existing organizations** (in one transaction, aborted if any check fails):
  1. Create the industries. Every existing tenant gets `Automotive Accessories` and `modules = '{vehicle_fitment}'`.
  2. Build the global Automotive catalog once from the V1 default tree (`docs/categories.md`, the same data as `private.seed_default_categories()`), with the SKU prefixes and icons from `src/lib/categories.ts`.
  3. For each tenant, match each of its categories to the global one by full path (case-insensitive). Matched → repoint `inventory_items.category_id` to the global row. Unmatched (categories the shop created or renamed) → keep as **org-specific** categories for that tenant, re-parented under the matching global parent.
  4. Default categories the shop had deleted become `tenant_hidden_categories` rows, so the shop's tree looks exactly as before.
  5. Delete the per-tenant copies of the catalog.
  6. Check: every item's category path is unchanged, and per-tenant category counts as the shop sees them are unchanged.
- Drop trigger `tenants_seed_categories` and functions `private.seed_default_categories` / `private.insert_category_tree` (new organizations need no seeding: they see their industry catalog at once). New organizations get the industry's default modules (trigger `tenants_industry_defaults`). *(Rev 8: `handle_new_shop_registration` and its trigger were dropped; Create Organization calls the service-role `public.admin_create_organization(user, name, full name, industry)`.)*
- `search_inventory_items` and `match_vehicles` / CSV category matching keep working through RLS (visible categories only).
- Service-role-only RPCs for the console: `admin_category_usage(p_industry)`, `admin_remap_tenant_industry(p_tenant, p_new_industry, p_mapping jsonb)`.

**Affected files**:
- **New (admin)**: `src/app/admin/industries/*`, `src/app/admin/categories/*`, `src/app/admin/tenants/[id]` (Categories + Modules tabs, industry change wizard), `src/components/admin/industry-manager.tsx`, `category-catalog-editor.tsx` (from `src/components/settings/category-manager.tsx`), `tenant-categories.tsx`, `industry-remap-wizard.tsx`, `category-requests.tsx`, `src/lib/actions/admin-categories.ts`, `admin-industries.ts`.
- **Changed**: `src/lib/actions/categories.ts` (org side: read + `requestCategory` only), `src/app/(dashboard)/settings/categories/page.tsx` (read-only + request form), `src/components/settings/settings-tabs.tsx`, `src/lib/categories.ts` (prefix and icon from the row, icon-name → Lucide map), `src/lib/category-data.ts`, `src/components/inventory/category-picker.tsx`, `inventory-filters.tsx`, `inventory-item-dialog.tsx`, `src/lib/actions/inventory.ts`, `inventory-csv.ts`, `src/lib/inventory-csv.ts`, `src/app/api/quote-items/route.ts`, `src/components/quotes/document-pages.tsx`, `src/app/(auth)/register/*` + `src/lib/actions/auth.ts` (removed in Rev 8), `src/components/admin/create-organization.tsx` + `src/lib/actions/admin.ts`, `src/lib/auth.ts` (`tenant.industry`, `tenant.modules`), new `src/lib/modules.ts`, `src/app/api/vehicles/route.ts`, notification bell (category request outcomes), email templates (`category_request` to superadmin, `category_request_result` to the requester), `src/lib/types/database.types.ts`.
- **Docs**: `docs/category-templates/` (one file per industry; see item 8; `docs/categories.md` stays the Automotive tree).

**Checkpoint**:
- **SQL** (rolled back):
  - A grocery organization sees only the grocery catalog + its own categories.
  - An apparel organization doesn't see grocery categories or another apparel organization's own categories.
  - An org admin can't insert, update or delete any category, or change `industry_id` / `modules`, through the API.
  - Hidden categories disappear from that organization only.
  - An item can't point at another industry's category.
  - Impersonating a shop shows that shop's tree.
- **Migration check on the real data**: every V1 item keeps its exact category path; the shop's Settings → Categories tree matches V1 (same names, same count).
- **Browser**:
  - Superadmin creates a grocery organization (Create Organization) → grocery categories in its product dialog, filters and CSV; no vehicle UI anywhere.
  - Superadmin adds an org-specific category → appears for that shop only.
  - `/register` is gone; a public sign-up API call creates no organization (Rev 8).
  - Org admin requests a category → superadmin approves it → it shows in the requester's picker and notification.
  - Superadmin changes an organization's industry through the wizard → no item is left unmapped.
  - Archived category hidden from pickers, still printed on old invoices.
  - The automotive shop is pixel-identical to V1 for fitment.
  - RF-18.1: a category attribute appears in the dialog only for that category's items, is required when marked so, filters the list, round-trips through CSV and prints on documents when flagged; an org admin can't create or change definitions.
  - RF-18.2: a category colour and image show in the picker, editor and chips in both themes; an oversized or wrong-type image is rejected.
  - RF-18.3: a new grocery shop sees the Get started card, steps tick off as data is added, and the superadmin sees the same percentage.

---

### PHASE 19 · Units of Measure, Decimal Quantities & Retail-Neutral Customers  *(M2)*

**Goal**: sell 1.250 kg of rice, a box of 12, or 2.5 meters of cloth with correct stock, for any industry.

**Recommended features (offered when this phase starts, §10)**: RF-19.1 Separate purchase and sale units · RF-19.2 Customer groups & tags.

**Deliverables**
1. **Units of measure**: `units_of_measure` per organization, created from the industry's default UOM list (Phase 18): pcs, pack, box, dozen, kg, g, litre, ml, meter, cm, pair, set. Each unit has `decimals` (0–3) and an `is_base` flag. Org admins can add units (unlike categories, units stay under organization control). Each item has a **base unit**. Optional **selling conversions** in `item_uom_conversions` (e.g. 1 box = 12 pcs, 1 dozen = 12 pcs) have their own price and barcode, so staff can scan the box barcode and sell 1 box = 12 pcs out of stock.
2. **Decimal quantities** (decision 3) everywhere: item dialog, steppers (step = 1 for whole units, typed decimals for weighed units), document lines, slip/PDF ("1.250 kg"), CSV ("Unit" column).
3. **Customer types generalised**: `customer_type` becomes a per-organization list. Defaults are Retail / Wholesale / Corporate (B2B); automotive organizations also keep Dealership / Fleet Account (data migrated as-is). The V1 database rule that dealerships / fleet accounts need tax details becomes "types flagged `requires_tax_details` need tax details".
4. **Purchase & sale units** (RF-19.1, accepted 2026-10-25): each item gets an optional default **purchase unit** and **sale unit** (`inventory_items.purchase_uom_id`, `sale_uom_id`; empty = the base unit). Each must be the base unit or one of the item's conversions. Document lines start in the sale unit and convert to base units for stock (`quote_items.uom_factor`); purchase orders and goods receiving (Phase 25) start in the purchase unit. The product dialog, details panel and CSV (`Purchase unit`, `Sale unit` columns) show both.
5. **Customer groups & tags** (RF-19.2, accepted 2026-10-25): `customer_tags` per organization (name and a colour from the category palette) linked to customers many-to-many. Org admins create, rename, recolour and delete tags in Settings; anyone who can edit a customer assigns existing tags in the customer dialog. Tags show as chips on the customer list and profile, filter the customer list (`?tag=`) and the customer-based reports, and export in the customer CSV. Statements (Phase 30) and price lists (Phase 26) use the same tags when they arrive. Superadmin parity through `resolveTarget()`.
6. **Pack settings** (Rev 9, owner request 2026-10-25): Settings → Units has a **Sell and buy in packs** switch (`tenants.packs_enabled`, off by default; switching it on adds Box, Carton, Pack and Dozen if missing) and a **Can be a pack** flag per unit (`units_of_measure.is_pack`, seeded from the presets). Only pack units can be a product's pack, and only while the switch is on (database trigger; existing packs keep working). The product dialog's **Sell in** / **Buy in** pickers list the product's own unit and every pack unit; choosing one it doesn't have yet adds the pack row. With the switch off the Packs section is hidden, documents offer base units only and packs already set up are kept. Superadmin parity on the console's Units & customers tab. The switch is a setting saved from the Save Settings bar (Discard / leave guard), and Add unit offers the platform's measuring presets (mm, cm, in, ft, rft, m, sqft, sqm, sqyd, cbm, cft, kg, ton, lb, l, gal…) as one-click picks.

**Migration outline** — `…_phase18_uom_decimal_qty.sql`:
- `units_of_measure`, `item_uom_conversions` (+ RLS, unique `(tenant_id, lower(code))`), `inventory_items.base_uom_id` (backfilled to the organization's `pcs`).
- Type changes `integer → numeric(14,3)` on `quantity_on_hand`, `reserved_quantity`, `low_stock_threshold`, and `quote_items.quantity → numeric(14,3)`.
  - Drop and recreate the dependent generated columns `available_quantity` and `is_low_stock`.
  - Recreate `quote_items_sync_stock`, `quotes_sync_stage_stock`, `save_inventory_item`, `save_quote`, `report_data`, `shop_alerts` and `search_inventory_items` with numeric signatures, dropping the old overloads as V1 did.
- `quote_items.uom_id`, `uom_factor` (snapshot of the conversion used).
- `customer_types` table, seeded per tenant (from the industry). `customers.customer_type` either becomes an FK or stays text validated by a trigger; decide in the phase, FK preferred.

**Affected files**: `src/lib/validations/inventory.schema.ts`, `src/lib/actions/inventory.ts`, `inventory-csv.ts`, `src/lib/inventory-csv.ts`, `src/components/inventory/*`, `src/components/quotes/line-items.tsx`, `line-search.tsx`, `src/lib/quote-math.ts`, `src/components/pdf/*`, `pos-slip.tsx`, `src/components/customers/*`, `src/lib/actions/customers.ts`, `src/app/(dashboard)/settings/*` (Units and Customer types cards), new `src/lib/uom.ts`, `src/lib/types/database.types.ts`.

**Checkpoint**:
- Sell 1.250 kg and 1 box (= 12 pcs) with correct stock.
- Numeric rounding rules (3 dp quantity, 2 dp money) verified in SQL.
- V1 documents' totals are unchanged after the type change.
- The V1 CSV export re-imports cleanly.
- The old RPC overloads are gone.
- RF-19.1: an item bought in cartons and sold in pieces starts invoice lines in pieces; selling 1 carton takes the right number of pieces from stock.
- RF-19.2: tags filter the customer list and reports, show on the list and profile, and export in CSV; only org admins manage tags.
- Rev 9: with packs switched off no pack can be set up and documents offer base units only (existing packs kept); with them on, only units marked as packs can be packs, and picking a new pack under Sell in adds its row.

---

### PHASE 20 · Multiple Stores & Per-Store Stock  *(M2)*

**Goal**: an organization can run several stores. Every store can **see** every other store's stock, but by default a store can **invoice only its own stock**. An organization can choose to allow invoicing from other stores in Settings.

**Recommended features (offered when this phase starts, §10)**: RF-20.1 Store-level price overrides · RF-20.2 Per-store numbering series. **Both accepted 2026-10-25** (deliverables 7 and 8).

**Rules**
- **Viewing**: every member of the organization can see every store's stock levels (on hand, reserved, available).
- **Invoicing (default)**: a document belongs to the **current store** of the user who creates it. Quotations, sales orders, delivery challans and invoices reserve and deduct **only that store's stock**. A line can't take more than the current store has available, even if other stores have plenty.
- **Invoicing from other stores (optional)**: the setting is Settings → Stores → **"Allow invoicing from other stores' stock"**, off by default, admin only.
  - When it's on, a line can name a different **source store** (the line search shows a "From: Store B" choice), and that line's stock is reserved/deducted at Store B.
  - The document still belongs to the current store: its number series, header and reports stay with that store.
  - A second setting decides who may do it: everyone who can invoice, or managers/admins only. The default is managers/admins, enforced by the permission `invoice_from_other_store` (Phase 22).
  - Every such line is recorded with its source store, and the stock movement is attributed to it.
- **Getting stock from another store when the setting is off**: the line shows "Only 2 here · 15 at Store B". Two options:
  - **Request transfer**: creates a transfer request to Store B (Phase 24).
  - The admin can switch on cross-store invoicing.
- **Editing a document** means working in its store: open it, and the app asks to switch to that store (if the user has access). It can't be moved to another store after it reserves or deducts stock.

**Deliverables**
1. **Stores** (`/settings/stores`, admin): name, code (optional prefix in numbering, e.g. `LHR1`), address, phone, optional NTN/STRN and document-header override (Phase 27 falls back to the business profile), active flag. Every organization gets a "Main Store" automatically, so single-store organizations see no difference from V1.
2. **Staff ↔ store access**: `profile_stores` (stores a member can **work in**, i.e. create documents there) and `profiles.default_store_id`. Admins and managers can work in every store. Viewing stock is never restricted by this.
3. **Current store**: a store switcher in the top bar, for members with more than one store.
   - The current store is kept in a cookie and re-checked against `profile_stores` on every request.
   - It decides where new documents go and whose stock is invoiced.
   - Dashboards, document lists and reports filter by the current store, or "All stores" for members who can work in more than one store, and for managers/admins.
4. **Stock across stores**:
   - The inventory table shows **This store** available stock, plus an **Other stores** total with a per-store breakdown (popover; on phones, a bottom sheet).
   - The item details page shows a table of all stores.
   - The document line search and global search show "Available here: 2 · Other stores: 15", and the per-store list on expand.
   - Low-stock alerts are per store (optional per-store threshold).
   - Opening stock and CSV import go to the chosen store.
5. **Stock ledger table** (`stock_movements`): item, store, qty change, balance after, unit cost, type, source document, user, time.
   - Types: `sale`, `sale_cancel`, `reserve`, `release`, `delivery`, `return`, `adjustment`, `count`, `transfer_out`, `transfer_in`, `purchase_receipt`, `supplier_return`, `opening`, `import`.
   - Written from day one; the UI comes in Phase 24.
6. **Documents carry a store**: every new quotation, order and invoice gets `store_id` (= current store). Each line gets `source_store_id` (= the document's store unless cross-store invoicing is allowed and used). V1 documents are backfilled to Main Store.
7. **RF-20.1 Store prices** (accepted 2026-10-25): a store can sell a product at its own price (`store_item_prices (store_id, item_id, selling_price)`).
   - Set in the product dialog (**Store prices**, admins) and shown on the item details store table; Settings → Stores shows how many products each store prices differently.
   - It replaces the product's own price in that store: new document lines start at it, packs without their own price are store price × pack size, and packs with their own price keep it.
   - The price comes from the **document's** store (not a line's source store). `save_quote` applies it in SQL, so the line search and the saved document always agree.
8. **RF-20.2 Per-store numbering** (accepted 2026-10-25): Settings → Stores → **"Number documents per store"** (off by default, admin only).
   - On: each store has its own drafts / quotations / invoices series, prefixed by its code: `LHR1-INV-1001`. Every active store needs a code before it can be switched on, and new stores need one while it's on. Codes are unique in the organization.
   - Each store's series continues from that store's highest number so far (or the organization's start number); off again, the shared series continues from the organization's highest number. Numbers already issued never change.

**Migration outline** — `…_phase19_stores.sql`:
- `stores`, `profile_stores`, `profiles.default_store_id`.
- `stock_levels`: PK `(item_id, store_id)`, `on_hand numeric(14,3)`, `reserved numeric(14,3)`, nullable `low_stock_threshold`.
- `stock_movements`, with index `(tenant_id, item_id, created_at desc)`.
- `quotes.store_id`, `quote_items.source_store_id`.
- `tenants.allow_cross_store_invoicing boolean not null default false`, `cross_store_invoicing_roles text not null default 'managers'` (`'all'` | `'managers'`).
- Backfill: one Main Store per tenant, each item's V1 stock moved into it with an `opening` movement. The migration aborts if any item's total changes.
- `private.apply_stock(item, store, delta, type, source…)`, used by the rewritten `quote_items_sync_stock` / `quotes_sync_stage_stock`. Stock is taken from `quote_items.source_store_id`.
- **Enforced in SQL**, so the UI can't be bypassed:
  - `save_quote` / the stock triggers refuse a line whose source store differs from the document's store unless the tenant setting is on and the caller has the permission.
  - A document can only be created in a store listed in the caller's `profile_stores` (admins/managers: any).
  - A store can't change once stock is held.
- A trigger keeps the `inventory_items` totals equal to Σ `stock_levels`.
- **RLS**: `stock_levels` readable by every member of the tenant; writes only through `private.apply_stock`. `stores` readable by all members; admin-only changes. Documents follow the V1 tenant rules, filtered in the UI by the current store. New helper `private.my_work_store_ids()`.

**Affected files**:
- **New**: `src/app/(dashboard)/settings/stores/*`, `src/components/settings/store-manager.tsx` (stores + the cross-store invoicing settings), `src/components/shared/store-switcher.tsx`, `src/components/inventory/store-stock-popover.tsx`, `src/lib/actions/stores.ts`, `src/lib/store.ts` (current store from the cookie, validated against access).
- **Changed**: `src/lib/auth.ts` (`store`, `workStores`); `src/lib/actions/inventory.ts` and `inventory-csv.ts`; `inventory-table.tsx`; item details; `line-search.tsx` and `line-items.tsx` (availability here / other stores, optional source-store choice, "Request transfer"); `/api/quote-items`; `/api/search`; document actions; dashboard/report RPC calls (`p_store_id`); `src/lib/printable.ts` (store header); the admin tenant page (store count).

**Checkpoint**:
- With two stores and the setting off:
  - An invoice at A can take only A's stock; a line for more than A has is refused in SQL even when B has stock.
  - Store A users see B's stock everywhere it's shown.
  - A user who can't work in B can't create a document in B through the API.
- With the setting on, managers only:
  - A manager invoices a line from B on an A invoice; B's stock drops and the movement names B.
  - A sales user is refused, in SQL as well as in the UI.
- V1 stock numbers are unchanged after the backfill (per-item sum check in SQL). A single-store organization looks the same as V1.
- Concurrency: two parallel invoices for the last unit → one is refused.
- RF-20.1: a product priced Rs 1,200 with a Store B price of Rs 1,350 starts at 1,350 on a Store B invoice and 1,200 on a Store A one; a box of 12 without its own price is 12 × 1,350 at B.
- RF-20.2: with per-store numbering on, A's next invoice is `A1-INV-…` and B's `B1-INV-…`, each counting on its own; switching it on is refused while an active store has no code.

---

### PHASE 21 · Product Variants & Matrix  *(M2)*

**Goal**: manage "Polo Shirt – Red – L" or "Cable 2.5mm – 90m roll" as variants of one product, each with its own SKU, barcode, price and stock.

**Recommended features (offered when this phase starts, §10)**: RF-21.1 Product bundles / kits · RF-21.2 Product image gallery.

**Deliverables**
1. **Product groups**: a parent product with name, category, description, brand, tax category, optional images (Supabase Storage `product-images`), and up to **3 option types** (Size, Color, Flavor, Capacity…) with ordered values.
2. **Matrix generator**:
   - Pick option values → a grid of combinations. Each cell becomes an `inventory_items` row with a generated SKU (`POLO-RED-L`).
   - Each cell has its own price (by default the group price; it can be overridden per cell or per option value, e.g. "+Rs. 200 for XL"), cost, barcode and opening stock per store.
   - Combinations that aren't sold can be disabled.
3. **Inventory list**: grouped rows (expand a group to see its variants, with totals rolled up) or a flat SKU view (toggle). Variant chips in search results ("Polo Shirt · Red / L").
4. **Bulk edit** across variants: price, cost, low-stock threshold, category, tax category.
5. **CSV**: `Group`, `Option 1 Name`, `Option 1 Value`, … columns; export/import round-trips.
6. **Documents**: scanning a variant barcode adds that variant. Picking a grouped product in line search opens a quick option picker (option buttons with stock per option).

**Migration outline** — `…_phase20_variants.sql`:
- `product_groups`, `product_option_types (group_id, name, position)`, `product_option_values (option_type_id, value, position, price_delta)`.
- `inventory_items.group_id` and `option_values jsonb`, unique `(group_id, option_values)`; `inventory_items.is_archived`.
- `quote_items.variant_label` snapshot.
- RPC `save_product_group(...)`: the group and all its variants in one transaction. Variants with stock or history are archived instead of deleted.

**Affected files**:
- **New**: `src/components/inventory/product-group-dialog.tsx`, `variant-matrix.tsx`, `option-picker.tsx`; `src/lib/actions/product-groups.ts`; `src/lib/validations/product-group.schema.ts`.
- **Changed**: `inventory-table.tsx`, `src/lib/inventory-csv.ts`, `line-search.tsx`, `/api/quote-items`, `/api/search`.

**Checkpoint**:
- A 3×4 matrix creates 12 SKUs with stock in two stores.
- A group price edit updates only the variants that don't have their own price.
- An archived variant is hidden from search, and its old invoices still print.
- A grouped catalog round-trips through CSV.

---

### PHASE 22 · Roles, Permissions & Manager Approvals  *(M2)*

**Goal**: staff can do exactly what their job needs; managers approve the exceptions; everything sensitive is logged.

**Recommended features (offered when this phase starts, §10)**: RF-22.1 Organization activity log · RF-22.2 Two-factor sign-in for organization users · RF-22.3 Sign-in hours per role.

**Deliverables**
1. **Roles**: `sales`, `storekeeper`, `accountant`, `manager`, `admin` (platform `is_superadmin` is unchanged). V1 `staff` → `sales`, `admin` → `admin`. The Team page role select and the Add User form (role + stores, deliverable 6) are updated.
2. **Permission matrix**. These are the defaults, shown read-only in Settings → Team → "What each role can do"; per-organization tweaks are allowed later.

| Permission | Sales | Storekeeper | Accountant | Manager | Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Quotations, sales orders, invoices (create / edit drafts) | ✓ | — | ✓ | ✓ | ✓ |
| Discount up to the organization limit (e.g. 10%) | ✓ | — | ✓ | ✓ | ✓ |
| Discount above the limit, price override, sell over credit limit | approval | — | approval | ✓ | ✓ |
| Cancel / void a posted invoice, issue a credit note | approval | — | ✓ | ✓ | ✓ |
| Invoice a line from another store's stock (only when the organization allows it, Phase 20) | setting | — | setting | ✓ | ✓ |
| Delivery challans (create, dispatch) | ✓ | ✓ | — | ✓ | ✓ |
| Record payments / receipt vouchers, cheques | ✓ (cash at counter) | — | ✓ | ✓ | ✓ |
| Statements of account (view / send) | own customers | — | ✓ | ✓ | ✓ |
| Write-offs, opening balances, ledger adjustments | — | — | approval | ✓ | ✓ |
| Inventory view / edit products | view | ✓ | view | ✓ | ✓ |
| Stock adjustments, counts, transfers | — | ✓ (adjust = approval above value limit) | — | ✓ | ✓ |
| Purchase orders / receiving | — | receive | — | ✓ | ✓ |
| Supplier bills & payments | — | — | ✓ | ✓ | ✓ |
| See cost & profit | — | — | ✓ | ✓ | ✓ |
| Reports | own sales | stock | financial | all | all |
| Settings, team, stores, numbering | — | — | — | store-level | ✓ |
| Categories | read / request | read / request | read / request | read / request | read / request (superadmin manages, Phase 18) |

3. **Approvals** (decision 7):
   - A guarded action shows, for example, "Manager approval needed: discount 25% (limit 10%)". There are two ways to approve it:
     - **Approve now**: a manager enters their PIN or password in the same dialog.
     - **Send for approval**: creates an approval request with the document link. The manager gets a notification (bell + optional email), approves or rejects it with a note, and the requester continues.
   - The approval is bound to the action, amount and document. It's single-use and expires after 24h (requests) or 60s (approve now). Each one is recorded in `approval_logs`.
4. **PIN for approvers** (4–6 digits, bcrypt, never returned; 5 wrong tries → 5-minute lock). This is used only for approvals, not for screen lock.
5. **Server-side enforcement**: every guarded RPC checks `private.has_permission()` or a valid approval. Hiding buttons in the UI is never relied on.
6. **Username sign-in, passwords set by the admin** (Rev 12). Organization users don't need email:
   - **Sign in** with **username + password** (the shop sign-in page asks for "Username"). Usernames are unique across ProductLogik, case-insensitive, 3–30 characters of letters, digits, `.` and `_` (e.g. `ali.airpress`); a taken one is refused with "That username is taken".
   - **Settings → Team → Add User** (replaces Invite Team Member): name, username, role, stores (Phase 20), password, typed twice. The user can sign in at once; nothing is emailed. Adding still counts against the subscription's user limit (Rev 11).
   - **Passwords are the admin's job**: the org admin sets a user's password and changes it from Team → **Set Password** whenever asked. It's saved hashed and never shown again (forgotten → set a new one). Users aren't asked to change it at sign-in. Setting a password signs that user out of their other sessions.
   - **Org admins** also sign in with a username. Their **email is required but used only for notifications** (subscription reminders, alerts, copies of statements); it is never a sign-in name. ProductLogik (console → Users → Set Password) resets an org admin's password; the console can set any organization user's password and username too (audited).
   - **No email recovery** for organization users: the sign-in page's "Forgot password?" says "Ask your organization's admin to set a new password" (admins: "Contact ProductLogik"). Resend / cancel invite, the invitation email and the `/reset-password` flow are removed for them.
   - **Superadmins are unchanged**: email + password + 2FA on the console sign-in.
   - **Superadmins change their own password** (Rev 13): the console's account menu → **Change Password** asks for the current password and the new one typed twice (same strength rules as `/reset-password`). It needs the `aal2` session like every console action; a wrong current password is refused. Saving signs the superadmin out of their other sessions (this one stays), keeps their 2FA factor, writes an audit row (`superadmin.password_changed`, no password in it) and emails them a "your password was changed" notice.
   - **Existing users** (migration): each gets a username from the part of their email before `@` (made unique with a number, e.g. `hamza2`), shown on Team, which the admin can change; their current passwords keep working. Admins keep their email as the notification address; staff emails are kept but no longer shown or used. Pending invitations become users without a password, marked "No password yet" until the admin sets one (that counts as activating them, within the user limit).
   - **How it works with Supabase Auth** (which needs an email): each organization user's auth email becomes an internal address (`<user id>@users.productlogik.internal`, never emailed). Sign-in looks the username up server-side (service role, rate-limited, the same "Wrong username or password" for any failure) and signs in with that address; the notification email lives on `profiles.email`.

**Migration outline** — `…_phase21_roles_approvals.sql`:
- `profiles.role` check `('sales','storekeeper','accountant','manager','admin')` + data migration.
- `private.role_permissions(role, permission)`, seeded; `tenant_permission_overrides` (admin-only, not used by default).
- `profiles.pin_hash`, not granted to `authenticated`; `pin_attempts`.
- `approval_requests` (action, context jsonb, document, requested_by, status, decided_by, note, expires_at) and `approval_logs`.
- RPCs `set_my_pin`, `request_approval`, `decide_approval`, `approve_now(p_action, p_context, p_approver, p_pin)`, `private.consume_approval(...)`.
- `tenants.discount_limit_pct`, `stock_adjust_approval_value`.
- `private.has_permission(text)`; every V1 admin-only policy reviewed against the new roles.
- Rev 12: `profiles.username` (citext, unique, format check; not updatable by members except through the admin RPC), backfilled from emails; `private.username_auth_email(username)` (service role only) for sign-in; existing organization users' `auth.users.email` moved to the internal address (superadmins untouched); `profiles.email` required for admins, optional for others.

**Affected files**:
- **New**: `src/lib/permissions.ts` (the same matrix in TS, for hiding UI), `src/lib/actions/approvals.ts`, `src/components/shared/approval-dialog.tsx`, `pin-pad.tsx`, `src/app/(dashboard)/approvals/page.tsx` (manager inbox).
- **Changed**: `src/lib/auth.ts` (`role`, `can()`); the team manager, its actions and schema; every newly permission-gated server action (inventory, settings, documents cancel/delete, payments); the notification bell.
- **Changed (Rev 12)**: the shop sign-in page and `src/lib/actions/auth.ts` (username); `team-manager.tsx` / `team.ts` (Add User, Set Password, no invite emails); the console's Users tab, Create Organization's first admin and bulk CSV (username + password); the forgot / reset-password pages (organization users sent to their admin); the `staff_invite` email template retired.
- **Changed (Rev 13)**: the console's account menu (Change Password dialog), a `changeMyPassword` superadmin action, and a "password changed" email template.

**Checkpoint**:
- SQL tests per role for every guarded RPC: allowed, refused, allowed with an approval, approval reused (refused), approval for a different amount (refused), expired (refused).
- PIN lockout after 5 wrong tries.
- Approval request → notification → approve → the requester's action completes.
- A deactivated manager can't approve.
- Rev 12: an admin adds "ali.airpress" with a password, and Ali signs in with it at once; a taken username (any case) is refused; Set Password makes the old one fail and signs Ali out elsewhere; a wrong username and a wrong password give the same message; nothing is emailed; existing users sign in with their new usernames and old passwords; superadmins still sign in by email + 2FA.
- Rev 13: a superadmin changes their password in the console; a wrong current password is refused; the old password then fails, other sessions are signed out, 2FA still asks for the code, and an audit row and notice email are written.

---

### PHASE 23 · Barcodes, SKU Management, Scan-to-Add & Label Printing  *(M3)*

**Goal**: every product has a scannable code, staff can scan instead of typing in every stock and sales screen, and the organization can print its own labels.

**Recommended features (offered when this phase starts, §10)**: RF-23.1 Phone camera barcode scanning.

**Deliverables**
1. **Barcode management** in the product dialog:
   - Several barcodes per item/UOM (manufacturer code + internal).
   - Symbology detection and validation:
     - **EAN-13** and **EAN-8**, with check digit.
     - **UPC-A**, with check digit; also matched as an EAN-13 with a leading 0.
     - **Code 128**: any printable ASCII.
     - **Code 39**: optional.
   - Duplicates are refused per organization.
   - "Scan to fill" fills the field from the scanner.
2. **Scanner support everywhere** (`use-barcode-scanner.ts`):
   - USB/Bluetooth scanners act as keyboards; the hook tells scanner bursts (≥ 6 characters, < 30 ms between keys, ending in Enter/Tab) from normal typing. Configurable prefix/suffix, optional beep.
   - It works in the **invoice / quotation / order builder** (scan → add line or +1), delivery challans, goods receiving, stock counts, adjustments, transfers, returns, and label selection.
   - An unknown code shows "Not found — add as new product?" for users with permission.
3. **Internal barcodes**: EAN-13 in the in-store range (prefix `20–29`, configurable) with correct check digits, numbered in sequence per organization. Bulk "generate for all items without a barcode".
4. **Label designer & printing** (`/inventory/labels`):
   - **Pick items**: by search, by category, from a goods receipt, or "received today". The quantity per item defaults to the quantity received.
   - **Sizes**: 38×25mm, 50×25mm, 50×30mm, 58mm continuous, and A4 sheets (3×8, 4×10).
   - **Fields**: business name, product, variant, price, barcode with digits, SKU, MRP/sale price, free text (batch / packed date).
   - **Output**: browser print with an exact `@page` size (label printers through their driver), and PDF. There are calibration offsets for sheet printers.
5. **SKU tools**:
   - SKU pattern per main category: by default the category's `sku_prefix` set by the superadmin (Phase 18), with an organization-level sequence such as `GRO-000123`.
   - Bulk re-SKU with a preview. Documents keep the SKU they were saved with.
6. **CSV**: `Barcode` (several separated by `;`) and `Unit` columns.

**Migration outline** — `…_phase22_barcodes.sql`:
- `item_barcodes` (code, symbology, item, uom_conversion, is_primary), unique `(tenant_id, code)`.
- `private.validate_barcode(code, symbology)`.
- `tenants.internal_barcode_prefix`, `internal_barcode_next bigint`; RPC `generate_internal_barcodes(p_item_ids uuid[])`.
- RPC `lookup_barcode(p_code)` (item, variant, UOM, price, store stock).
- `label_templates` (tenant, name, size, layout jsonb).

**Affected files**:
- **New**: `src/lib/barcodes/validate.ts`, `ean.ts`, `render.tsx` (SVG barcode), `src/lib/hooks/use-barcode-scanner.ts`, `src/app/(dashboard)/inventory/labels/page.tsx`, `src/components/labels/label-designer.tsx`, `label-sheet.tsx`, `src/components/pdf/labels-pdf.tsx`.
- **Changed**: the barcode section of the inventory dialog, `line-search.tsx` / `quote-builder.tsx` (scan-to-add), CSV helpers.

**Checkpoint**:
- Unit tests with known-good EAN-13 / UPC-A / EAN-8 codes and bad check digits, plus scanner burst vs human typing.
- Generated barcodes scan back correctly from print.
- A scan in the invoice builder adds the item, and scanning it again gives +1.
- An A4 3×8 sheet aligns.
- 500 labels render as a PDF in under 5 s.

---

### PHASE 24 · Stock Ledger, Adjustments with Reason Codes, Stock Counts, Transfers and Batch & Expiry  *(M3)*

**Goal**: no stock number changes without a reason and an audit trail, and stock that expires is tracked by batch.

**Recommended features (offered when this phase starts, §10)**: RF-24.2 Scheduled cycle counts · RF-24.3 Stock ageing report · RF-24.4 Serial numbers / IMEI per unit.

**Deliverables**
1. **Stock history** per item and per store: every `stock_movements` row in words ("Invoiced 2 on INV-1045 by Ayesha", "Damaged −1, ADJ-1003"), with a running balance. Filters by type and date; CSV export.
2. **Stock adjustments** (`/inventory/adjustments`):
   - A multi-line document for one store.
   - **Reason codes**: Damaged, Theft / Shrinkage, Spoilage / Expired, Inventory Count Discrepancy, Return to Vendor, Internal Use, Found / Recount, Opening Stock, Other (+ note). The organization can edit the reason list and mark each reason as increase, decrease or either.
   - Value impact at cost. Adjustments above a value limit need approval (Phase 22).
   - Direct stock edits in the product dialog stay allowed **only** when creating a new item (opening stock). Later changes go through an adjustment, so nothing silently changes the ledger. A small "Adjust stock" button in the product dialog opens a one-line adjustment, so it stays one click.
3. **Stock counts / stocktake**:
   - Count a store: everything, a category or a list of items.
   - Expected quantities are frozen when the count starts.
   - Count by scanning or typing; blind count option.
   - Variance review (quantity and value), then approve → posts `count` movements.
   - Partial counts; printable count sheets.
4. **Transfers between stores**: request → dispatch (leaves the source, "in transit") → receive (any discrepancy is recorded). Transfer documents `TR-…`, printable with or without cost.
5. **Valuation**: weighted-average cost per item, maintained by goods receipts (Phase 25) and used for adjustment/count values and cost of goods sold. Stock value per store and per category.
6. **Batch / lot & expiry tracking** (Rev 7; was RF-24.1):
   - **Switching it on**:
     - an organization setting "Track batches & expiry", on by default for organizations in industries whose defaults say so (Pharmacy, Grocery, Cosmetics)
     - a **Tracks batches** flag per item; an expiry date can be required or optional per item
   - **Where batches are recorded**:
     - opening stock, adjustments and counts
     - stock transfers (the batch moves with the stock)
     - goods receipts (Phase 25)
     - CSV import (Batch and Expiry columns)
   - **Stock per batch**:
     - quantity per batch, per store
     - the item's on-hand quantity is the sum of its batches
   - **Selling**:
     - invoice lines pick batches **earliest expiry first (FEFO)** automatically; staff can choose another batch
     - an expired batch can't be sold without manager approval (Phase 22)
     - one line can draw from several batches
   - **On documents**: the batch number and expiry print under the line on invoices, POS slips and delivery challans.
   - **Alerts**:
     - an "Expiring soon" list, with a per-organization warning period (default 90 days)
     - expired stock is shown and can be written off with the reason "Spoilage / Expired"
     - expiry warnings in the notification bell
   - **Returns** (Phase 28) go back into the batch they were sold from.

**Migration outline** — `…_phase23_stock_ops.sql`:
- `stock_adjustment_reasons`; `stock_adjustments` / `_items`; `stock_counts` / `_items`; `stock_transfers` / `_items` (statuses draft / dispatched / received / cancelled).
- RPCs, all through `private.apply_stock`: `post_stock_adjustment`, `start_stock_count`, `record_count_scan`, `post_stock_count`, `dispatch_transfer`, `receive_transfer`.
- `inventory_items.average_cost numeric(14,4)`, backfilled from `cost_price`; `stock_levels.in_transit`.
- Numbering `ADJ`, `SC`, `TR`.
- `save_inventory_item` refuses quantity changes on existing items.
- Batches: `tenants.track_batches`, `tenants.expiry_warning_days`; `inventory_items.tracks_batches`, `expiry_required`; `item_batches` (item, store, batch number, expiry date, quantity, unique per item + store + batch number); `stock_movements.batch_id`; a `document_line_batches` table (line, batch, quantity), because one line can draw from several batches. `private.apply_stock` posts per batch and picks FEFO when no batch is given. Existing stock of items switched to batch tracking moves into a batch called "Opening".

**Affected files**:
- **New**: `src/app/(dashboard)/inventory/{adjustments,counts,transfers}/**`, `src/components/stock/*`, `src/lib/actions/stock.ts`, `src/app/(dashboard)/inventory/expiring/**`, `src/components/stock/batch-picker.tsx`.
- **Changed**: the item details page (History and Batches tabs), the item dialog (Tracks batches), Settings → Inventory, document line items (batch choice), PDF / slip / challan line rendering, CSV import/export, the notification bell, the sidebar ("Stock" group), reports.

**Checkpoint**:
- After a scripted day of activity, the ledger sum equals on-hand for every item.
- A count with a variance posts the right deltas.
- Stock in transit can't be sold.
- Permissions are enforced per role.
- Batches: two batches with different expiries → an invoice takes the earlier one first, then spills into the next; the batch and expiry print on the PDF and slip; an expired batch is refused without approval; the batch quantities always add up to on-hand.

---

### PHASE 25 · Suppliers, Purchase Orders, Goods Receiving & Supplier Bills  *(M3)*

**Goal**: buy stock properly, from order to shelf to supplier payment, with costs that update themselves.

**Recommended features (offered when this phase starts, §10)**: RF-25.1 Landed cost · RF-25.2 Auto-draft purchase orders · RF-25.3 Supplier price history & comparison.

**Deliverables**
1. **Suppliers** (`/suppliers`):
   - Name, contact, phone/WhatsApp, email, address, NTN/STRN, payment terms (days), lead time, opening balance, notes.
   - V1 `vendor_name` values are migrated into supplier records (deduplicated, ignoring capitals) and linked as each item's preferred supplier.
   - An item can have several suppliers, each with a supplier SKU and the last cost. The item details page still shows the supplier as V1 did.
2. **Purchase orders** (`PO-…`):
   - Supplier, store, expected date, lines (item/variant, UOM e.g. box of 12, qty, unit cost, discount, tax), totals.
   - **Ordering in packs** (Rev 9): a line starts in the product's **buy-in unit** (`purchase_uom_id`, Phase 19 RF-19.1) and its unit can be switched to the base unit or any of the product's packs (only while packs are switched on in Settings → Units). The quantity is entered in that unit (e.g. 5 box); the cost is per that unit; the line stores `uom_id` / `uom_factor` like document lines, and receiving (deliverable 3) adds quantity × factor base units to stock (5 box × 12 = 60 pcs).
   - Statuses: draft → ordered → partially received → received / cancelled.
   - **Reorder suggestions**: items below their reorder point, grouped by supplier, with the quantity needed to reach the max level.
   - Send by WhatsApp or email (PDF via Resend).
3. **Goods receipts** (`GRN-…`):
   - Receive against a PO (partial, over, under or damaged) or directly without one; scanning works here.
   - Updates the **weighted average cost** and prompts for a selling-price update ("cost rose 12%, update price?").
   - Can print labels for the received items.
   - Batch-tracked items (Phase 24) need a batch number, and an expiry where the item requires one, on every received line.
4. **Supplier bills** (`BILL-…`): the supplier's invoice number and date, linked to one or more GRNs (or standalone for expenses with no stock), with due date and tax. Posts to the **supplier ledger**.
5. **Supplier payments** (`PV-…`): cash, bank or cheque issued; allocated to bills oldest-first or chosen by hand; advances to suppliers.
6. **Purchase returns / debit notes** (`DN-…`): from a GRN or ad hoc. Reduces stock (reason Return to Vendor) and the supplier balance.
7. **Supplier page**: ledger, open bills, payables aging; supplier statement (Phase 30 adds PDF/sending).

**Migration outline** — `…_phase24_purchasing.sql`:
- `suppliers`, `item_suppliers`.
- `purchase_orders` / `_items`, `goods_receipts` / `_items`, `supplier_bills` / `_items`, `supplier_payments` + `supplier_payment_allocations`, `debit_notes` / `_items`, `supplier_ledger`.
- `inventory_items.preferred_supplier_id`, `reorder_point`, `reorder_qty`, `max_level`.
- Data migration from `vendor_name` (the column is kept until Phase 33).
- RPCs `save_purchase_order`, `receive_goods`, `post_supplier_bill`, `record_supplier_payment`, `post_debit_note`, `reorder_suggestions(p_store, p_supplier)`.
- Numbering `PO`, `GRN`, `BILL`, `PV`, `DN`.

**Affected files**:
- **New**: `src/app/(dashboard)/suppliers/**`, `purchases/**` (orders, receipts, bills, payments), `src/components/purchasing/*`, `src/components/pdf/purchase-order-pdf.tsx`, `src/lib/actions/purchasing.ts`, `suppliers.ts`, validations.
- **Changed**: CSV (the Supplier column now links to a supplier), the sidebar ("Purchasing" group).

**Checkpoint**:
- PO for 100 → receive 60 → receive 40 → status received, stock +100, average cost correct to 4 dp.
- A bill against both GRNs → a partial payment → the supplier balance is right.
- A debit note reduces stock and the balance.
- Migrated suppliers match the V1 vendor names, and items still show them.

---

### PHASE 26 · Invoicing Upgrade: Sales Orders, Delivery Challans, Per-Line Tax, Sales Tax Invoices & Price Lists  *(M4)*

**Goal**: the V1 quotation → invoice flow becomes a complete B2B invoicing workflow. Every V1 behaviour stays.

**Recommended features (offered when this phase starts, §10)**: RF-26.1 Backorders · RF-26.2 Multiple addresses & contacts per customer · RF-26.3 Document attachments · RF-26.4 FBR digital invoicing integration · RF-26.5 Customer-specific item codes.

**Deliverables**
1. **Flow** (each optional step can be switched on in Settings → Documents): Quotation → **Sales Order** (confirmed, reserves stock) → **Delivery Challan(s)** → **Invoice** → Payment. The V1 shortcuts all stay: draft → invoice directly, quotation → invoice, walk-in invoices.
2. **Delivery challans** (`DC-…`):
   - Created from an order or invoice, or standalone (to be invoiced later); **partial deliveries** are allowed.
   - Delivery address, vehicle/driver/bilty number, receiver name.
   - **Printed without prices** (or with them, as an option), A4 or 80mm.
   - "Invoice uninvoiced challans" for a customer creates one invoice from several DCs.
   - The organization setting "stock leaves at" **Delivery** or **Invoice** (V1 default) decides which document posts the stock movement.
3. **Proforma invoice**: print/share a quotation or order as "PROFORMA INVOICE" (bank details included) for advance payment.
4. **Per-line tax** (decision 9):
   - Tax categories per item (Standard 18%, Reduced, Zero-rated, Exempt; editable rates).
   - The document line snapshots the rate. Tax-inclusive/exclusive works as in V1, per line.
   - **Further tax** option for unregistered customers (organization setting, rate editable).
   - The tax summary groups tax by rate.
   - V1 documents keep their single rate (copied to each line in the migration), so their totals don't change.
5. **Sales tax invoice layout**: an option for registered organizations. It shows:
   - seller and buyer NTN/STRN
   - HS code per item (new optional item field)
   - value excluding tax, rate, sales tax and value including tax per line
   - totals in figures and **in words**

   This is laid out to allow an FBR/PRA integration later; the integration itself isn't in scope.
6. **Price lists**: Retail (the item price, as in V1) plus any number of lists, e.g. Wholesale or Distributor, as fixed prices or a % off retail, with optional quantity breaks. Each list is assigned to customer types or to individual customers. The V1 customer default discount % keeps working on top.
7. **Builder upgrades**, keeping the V1 layout, steppers, undo, phone cards and cashier bar:
   - scan-to-add (Phase 23)
   - UOM per line (Phase 19)
   - variant picker (Phase 21)
   - line tax category
   - delivered / invoiced / returned quantity indicators
   - customer credit status banner (Phase 29 fills it in)
8. **Quick counter invoice**: on the V1 builder, "Walk-in / Cash" + scan-to-add + the V1 quick-cash payment dialog + the 80mm POS slip covers fast counter sales without a separate checkout screen.

**Migration outline** — `…_phase25_invoicing.sql`:
- Status `ordered` added to the quotation stage (+ `sales_order_number` series `SO`).
- `deliveries` (number, document, customer, store, status draft / dispatched / delivered / cancelled, address, transport fields), `delivery_items` (quote line, qty).
- `quote_items.delivered_quantity`, `invoiced_quantity` (trigger-maintained).
- `tenants.stock_out_at` ('invoice' | 'delivery'); stock triggers updated to post at the chosen document.
- `tax_categories` (per tenant, seeded); `inventory_items.tax_category_id`, `hs_code`; `quote_items.tax_category_id`, `tax_rate`, `tax_amount` (backfilled from the V1 document rate); `quotes.further_tax_rate`; `save_quote` and `quote-math.ts` updated to tax per line.
- `price_lists`, `price_list_items`, `price_list_breaks`; `customers.price_list_id`, `customer_types.price_list_id`; `private.resolve_price(item, customer, qty)` used by `save_quote` and `/api/quote-items`.
- Numbering `SO`, `DC`.

**Affected files**:
- **New**: `src/app/(dashboard)/orders/**`, `deliveries/**`, `src/components/deliveries/*`, `src/lib/actions/deliveries.ts`, `price-lists.ts`, `tax.ts`, settings cards (Tax categories, Price lists, Document flow).
- **Changed**: `src/components/quotes/quote-builder.tsx`, `line-items.tsx`, `line-search.tsx`, `src/lib/quote-math.ts`, `src/lib/documents.ts` (statuses), the sidebar.

**Checkpoint**:
- Every V1 document's totals are identical before and after the migration (SQL comparison over all rows).
- Mixed-rate invoice: SQL and TS totals agree for 200 random documents.
- Order 100 → DC 60 → DC 40 → one invoice from both DCs. Stock posts once, at the chosen document.
- The wholesale price list and quantity breaks apply.
- The sales tax invoice shows every required field.

---

### PHASE 27 · Document & Printing Engine: Business Profile on Every Document, POS Slip, A4 Templates & Digital Delivery  *(M4)*

**Goal**: every document prints and shares correctly in the format the organization uses. The V1 80mm POS slip and its printing stay exactly as they work today, and get better.

**Recommended features (offered when this phase starts, §10)**: RF-27.1 Bilingual documents (English + Urdu) · RF-27.2 Signature & stamp images · RF-27.3 Custom document fields · RF-27.4 Watermarks.

**Deliverables**
1. **Business profile on every document** (A4 PDF, POS slip, share page, email):
   - The document header takes every business detail the organization has saved in Settings → Profile: **logo, business name, address, NTN, STRN, phone, email**, plus the new optional **website** and **tagline / legal name** fields.
   - When a store has its own address/phone/NTN (Phase 20), those are used for that store's documents.
   - **Any field that isn't saved is skipped**: no empty label, no "NTN: —", no blank line, no placeholder logo space. The layout closes up.
   - One shared `buildBusinessHeader(profile, store)` drives every renderer, so they never disagree.
2. **POS slip (V1 Phase 11, kept)**:
   - Kept as is: screen printing without a new tab (`usePosSlipPrint`), the 80mm react-pdf receipt, the QR code to the customer link, quick cash/change, the Printing setting, Print / View / Download POS Slip in the toolbar and Share menu.
   - **Added**:
     - the business **logo** on the slip when one is saved (converted to black-and-white for thermal printers, with an on/off setting)
     - email and the new profile fields, skipped when empty
     - an optional **58mm** width
     - footer lines (returns policy, thanks note)
     - an optional Code 128 barcode of the document number
     - the slip for delivery challans (without prices) and receipt vouchers
   - **Optional raw thermal printing**: printers that need it can use the optional Web Serial/WebUSB ESC/POS output for faster raw printing on Chrome/Edge desktops. Browser printing stays the default, so nothing changes for existing setups.
3. **A4 templates**:
   - The V1 A4 layout restyled in the ProductLogik look, plus **Classic** and **Compact** templates.
   - A4 / A5 / Letter paper.
   - Amount in words (Rupees and paisa).
   - Tax summary by rate, multi-page headers and page numbers, delivery address, signature/stamp area.
   - Bank remittance box (V1 Phase 14, kept).
   - Per-document-type default template and paper.
4. **Print settings** (Settings → Printing): the V1 "Print format" (A4 or POS slip) is kept and extended **per document type** (quotation, order, DC, invoice, credit note, receipt voucher, statement, PO), with a live preview of the header showing exactly which profile fields will appear.
5. **Digital delivery**: Share on WhatsApp, Copy customer link and Email to customer (V1, kept) now cover every document type. A new `document_share` email variant is added per type. Each document type also gets a public link page (`/share/[token]`).

**Migration outline** — `…_phase26_print_engine.sql`:
- `tenants.website`, `legal_name`, `tagline` (column grants as for the V1 profile fields).
- `stores` header overrides (Phase 20 columns used).
- `print_templates` (tenant, document_type, paper, template, flags jsonb: show logo on slip, slip width, footer lines, show barcode).
- `tenants.print_format` migrated into per-type defaults; kept readable until Phase 33.
- `email_logs.template` check extended (`delivery_challan`, `credit_note`, `receipt_voucher`, `statement`, `purchase_order`, `recurring_invoice`).

**Affected files**:
- **New**: `src/lib/printing/business-header.ts`, `src/lib/printing/templates.ts`, `src/lib/escpos/*` (optional), `src/components/settings/print-settings.tsx` (preview).
- **Changed**: `src/lib/printable.ts`; `src/components/pdf/document-pdf.tsx` (templates); `src/components/pdf/thermal-receipt.tsx` and `src/components/quotes/pos-slip.tsx` (logo, empty-field skipping, 58mm, more document types); `src/components/quotes/print-document.tsx`, `share-menu.tsx`; `src/app/share/[token]/*`; `src/components/settings/shop-profile-form.tsx` (new fields); `src/lib/email/templates/documents.ts`.

**Checkpoint**:
- **Header field matrix**: print each document type with (a) every profile field filled, (b) only the name, (c) a mix (no logo, no NTN, no email). PDF text (pdftotext) and slip screenshots show exactly the saved fields and no empty labels or gaps.
- The V1 POS slip flow is unchanged step by step: print from the toolbar, the system dialog opens on the same page, AirPrint on a phone, the slip PDF downloads.
- The slip logo prints legibly on a real thermal printer if one is available, and in the PDF.
- 58mm and 80mm both look right.
- Every V1 Phase 11 / Phase 14 check from §7 passes again.

---

### PHASE 28 · Credit Notes, Sales Returns & Debit Notes  *(M4)*

**Goal**: correct a posted invoice properly instead of editing or deleting it, with stock and balances following.

**Recommended features (offered when this phase starts, §10)**: RF-28.1 Return requests from the customer link · RF-28.2 Return reasons analytics.

**Deliverables**
1. **Sales return / credit note** (`CN-…`):
   - Created from an invoice (pick lines and quantities, never more than invoiced minus already returned; a scanned document barcode finds the invoice) or standalone (price adjustment, goodwill).
   - A reason per line, and a **restock** toggle per line: back to the store the stock came from (the line's source store), or recorded as damaged.
   - Discounts and tax are reversed in proportion, computed in SQL.
   - Settlement: **reduce the invoice balance**, **refund** (cash/bank/cheque; recorded in the ledger) or **keep as customer credit** (applied to future invoices).
   - Prints on A4 or the POS slip and can be shared like an invoice.
2. **Invoice status** shows "Partially returned" / "Returned". Reports are net of returns.
3. **Cancelling invoices** keeps the V1 behaviour (cancel = void, stock given back, only while nothing is paid). There's a setting to require a credit note instead once an invoice is older than N days or appears on a sent statement.
4. **Debit notes to customers** (extra charges after invoicing, e.g. freight): increase the balance, posted to the ledger. Supplier debit notes are covered in Phase 25.

**Migration outline** — `…_phase27_credit_notes.sql`:
- `credit_notes` (number, invoice, customer, store, reason, totals, settlement), `credit_note_items` (invoice line, qty, restock, reason, amounts).
- `quote_items.returned_quantity` (trigger-maintained).
- `customer_debit_notes` + items.
- RPC `post_credit_note(...)` (validates quantities, computes amounts, posts stock + ledger); `tenants.void_requires_credit_note_after_days`.
- Numbering `CN`, plus a separate customer debit note series.

**Affected files**:
- **New**: `src/app/(dashboard)/credit-notes/**`, `src/components/credit-notes/*`, `src/lib/actions/credit-notes.ts`.
- **Changed**: the invoice detail page (Returns section, "Create credit note"), the print engine (CN and debit note templates), reports.

**Checkpoint**:
- A partial return of a discounted, tax-inclusive line refunds the exact proportional amount, and SQL and TS agree.
- No more can be returned than was invoiced, across several credit notes.
- Restock vs damaged stock effects are correct.
- The three settlements (balance, refund, credit) update the ledger correctly.

---

### PHASE 29 · Customer Ledger, Receipt Vouchers, Cheques & Credit Control  *(M5)*

**Goal**: every customer's balance is exact, explainable line by line, and controlled.

**Recommended features (offered when this phase starts, §10)**: RF-29.1 Customer portal · RF-29.2 Bank statement import & matching · RF-29.3 Late payment charges.

**Deliverables**
1. **Customer ledger** (decision 8):
   - Opening balance, invoices, debit notes, credit notes, receipts, advances, refunds, write-offs (approval), bounced cheques, adjustments (approval, with a reason), each with a running balance.
   - V1 data is migrated: each V1 invoice and payment becomes ledger rows, so every customer's balance equals the V1 "money owed" figure.
   - A new **Account** tab on the customer profile.
2. **Receipt vouchers** (`RV-…`):
   - Receive money from a customer **once** and allocate it across several invoices (oldest first, or chosen by hand). An unallocated remainder stays as an **advance**, applied automatically or by hand to later invoices.
   - Methods: Cash, Card Terminal, Bank Transfer, Cheque, Online / Raast, Mobile Wallet (JazzCash / EasyPaisa…), each with a reference.
   - Printable on A4 or the POS slip; email/WhatsApp receipt (the V1 payment receipt email, extended).
   - The V1 per-invoice "Record Payment" dialog (quick cash, change, paying specific lines) stays exactly as it is and creates a receipt voucher behind the scenes.
3. **Cheque tracking**:
   - Cheque number, bank, cheque date (post-dated allowed), and status: received → deposited → cleared / **bounced**.
   - A bounced cheque reverses its allocations and can add a charge.
   - A post-dated cheques list with due-today alerts in the notification bell.
4. **Credit control**:
   - Per-customer **credit limit** (V1 `credit_days` kept).
   - A credit status banner in the builder: balance, overdue, available credit.
   - The organization setting decides what happens when an invoice would go over the limit or the customer has overdue invoices: warn, block, or manager approval.
   - Customers can be put on **credit hold** by hand.
5. **Opening balances import**: CSV of customers with their opening balance as of a date, for organizations moving from paper khata or another system.
6. **Payment accounts (light)**: "Cash in hand", "Meezan Bank – 0123", etc. Each receipt and payment says which account it went to, giving a simple cash/bank book per account. This isn't a general ledger.

**Migration outline** — `…_phase28_customer_ledger.sql`:
- `customer_ledger` (customer, store, type, signed amount, balance_after, source table/id, note, by, at), index `(tenant_id, customer_id, created_at)`.
- `receipt_vouchers`, `receipt_allocations` (voucher → invoice/debit note, amount; feeds V1 `invoice_payments` so `amount_paid` and statuses keep working), `cheques`.
- `payment_accounts`; `customers.credit_limit`, `credit_hold`, cached `account_balance`, `advance_balance` (trigger-maintained).
- `tenants.credit_limit_policy`.
- RPCs `post_receipt_voucher`, `apply_advance`, `update_cheque_status`, `post_ledger_adjustment`, `import_opening_balances`.
- Backfill of V1 invoices and payments, with a per-customer reconciliation check that aborts on mismatch.

**Affected files**:
- **New**: `src/app/(dashboard)/receipts/**`, `src/components/customers/ledger-table.tsx`, `receipt-voucher-dialog.tsx`, `cheque-list.tsx`, `src/lib/actions/ledger.ts`, `receipts.ts`, `cheques.ts`.
- **Changed**: `src/components/quotes/payment-dialog.tsx` (same UI, now goes through the voucher RPC), the customer profile page, the builder's credit banner, the notification bell.

**Checkpoint**:
- The migrated balances equal V1's for every customer.
- Opening + debits − credits = closing for every customer, in SQL.
- One receipt of Rs. 100,000 over three invoices + an advance → the invoices show Paid / Partially Paid correctly.
- A bounced cheque reverses its allocations.
- A credit-limit block vs approval follows the setting.
- The V1 Record Payment flow with quick cash is unchanged for the user.

---

### PHASE 30 · Statements of Account, Collections & Supplier Statements  *(M5)*

**Goal**: send a professional statement to any customer in two clicks, and chase what's overdue.

**Recommended features (offered when this phase starts, §10)**: RF-30.1 Reminder sequences (dunning) · RF-30.2 Editable message templates.

**Deliverables**
1. **Statement of account (SOA)** for a customer:
   - **Contents**: business header (Phase 27 rules: saved fields only), customer details, and a date range (this month / last month / custom / since the first transaction). Then opening balance, each transaction (date, document, description, debit, credit, running balance) and closing balance.
   - **Open invoices only** as a variant of the statement.
   - **Footer**: aging buckets (current, 1–30, 31–60, 61–90, 90+), bank details / payment instructions (V1 bank remittance details), notes.
   - **Formats**: A4 PDF and the 80mm POS slip (summary version).
2. **Send**: WhatsApp (pre-filled message + link to a public statement page `/s/[token]` with expiry), email via Resend (PDF attached), download/print. Every send is logged on the customer's timeline.
3. **Bulk statements**: pick customers (all with a balance, overdue only, by type / store / salesperson) → preview → send by email, plus a WhatsApp click-through queue for the rest. A **scheduled monthly statement run** (e.g. the 1st of every month) emails statements automatically to customers who have an email.
4. **Collections**:
   - A receivables dashboard: total owed, overdue, aging chart, top debtors, promises to pay.
   - A **follow-up log** per customer (called, promised a date, disputed), with reminders in the notification bell.
   - Overdue reminder emails (automatic, optional, with a frequency setting).
   - WhatsApp reminders: a pre-filled message, sent by hand.
5. **Supplier statements**: the same engine for suppliers (payables, aging), plus "reconcile with the supplier's statement" (tick off matched entries).

**Migration outline** — `…_phase29_statements.sql`:
- RPC `customer_statement(p_customer, p_from, p_to, p_mode)` and `supplier_statement(...)`.
- `statement_tokens`, `statement_runs` (schedule, filters, last run, results), `customer_followups`.
- `pg_cron` jobs for scheduled runs and reminder emails (calling a secured route or an edge function that uses `sendTransactionalEmail` rules, rate limits and `email_logs`).

**Affected files**:
- **New**: `src/app/(dashboard)/statements/**`, `collections/**`, `src/components/statements/*`, `src/components/pdf/statement-pdf.tsx`, the statement slip renderer, `src/app/s/[token]/page.tsx`, `src/lib/actions/statements.ts`, `collections.ts`, the scheduled-run route `src/app/api/cron/statements/route.ts` (secret-protected).
- **Changed**: email templates (`statement`, `overdue_reminder`), the customer and supplier pages.

**Checkpoint**:
- The statement reconciles with the ledger for 50 random customers and date ranges.
- Header field matrix as in Phase 27.
- A bulk run of 30 customers stays under the email rate limits, is logged, and resumes after an interruption without sending duplicates.
- Public links expire.
- The scheduled run fires in a test schedule.

---

### PHASE 31 · Recurring Billing & Batch Invoicing  *(M5)*

**Goal**: organizations that bill the same customers regularly (rentals, maintenance contracts, subscriptions, monthly supplies) stop re-typing invoices.

**Recommended features (offered when this phase starts, §10)**: RF-31.1 Usage / meter-based billing · RF-31.2 Proration · RF-31.3 Contract renewal reminders.

**Deliverables**
1. **Recurring invoice schedules**:
   - Customer, lines (items or services), frequency (weekly / monthly / quarterly / yearly / every N), day of the month, start date, end date or number of cycles.
   - Mode: **create draft for review** or **issue automatically**. Auto-email/WhatsApp-ready on issue.
   - Price follows the current price list, or stays fixed.
2. **Billing runs**: "Bill all due schedules now" or scheduled daily (`pg_cron`). A run report lists what was created, what failed (e.g. customer on credit hold) and why. Re-running is idempotent per period.
3. **Batch invoicing**: one set of lines → invoices for many selected customers (e.g. monthly service fee), with preview.
4. **Billing calendar**: upcoming invoices per customer and the expected monthly revenue.

**Migration outline** — `…_phase30_recurring_billing.sql`:
- `recurring_invoices` (customer, schedule fields, mode, next_run_date, status active / paused / ended), `recurring_invoice_items`.
- `billing_runs` + `billing_run_items` (unique `(recurring_invoice_id, period)` for idempotency).
- RPC `run_billing(p_date)` (uses `save_quote` + `convert_quote` internally); `pg_cron` daily job.

**Affected files**:
- **New**: `src/app/(dashboard)/billing/**` (schedules, runs, calendar), `src/components/billing/*`, `src/lib/actions/billing.ts`.
- **Changed**: the customer profile (Billing tab), email templates.

**Checkpoint**:
- A monthly schedule produces exactly one invoice per period across repeated runs.
- Draft vs auto-issue modes work.
- A credit-hold customer is skipped and reported.
- The end date stops the schedule.
- A batch of 20 invoices has correct numbering under concurrency.

---

### PHASE 32 · Inventory, Sales & Receivables Reporting  *(M6)*

**Goal**: owners and accountants see stock, sales and money the way they actually manage them. All V1 reports and dashboard widgets stay.

**Recommended features (offered when this phase starts, §10)**: RF-32.1 Scheduled report emails · RF-32.2 Saved report views · RF-32.3 Excel export & accountant packs.

**Deliverables**
1. **Dashboard**: the V1 widgets, date range and per-user layouts are kept. New widgets:
   - stock value
   - low/out-of-stock count per store
   - pending deliveries
   - POs to receive
   - receivables and overdue
   - post-dated cheques due
   - payables due
   - sales vs last period
   - gross margin

   There's a store selector, plus an "All stores" comparison.
2. **Reports** (`/reports`, each with CSV + PDF export; the V1 reports stay):
   - **Inventory**: Stock on hand & valuation (per store), stock movement / item ledger, adjustments & shrinkage by reason, count variances, dead stock / slow movers, reorder report, transfers in transit.
   - **Sales**: by customer, item/variant, category, salesperson and store; delivery vs invoiced (uninvoiced challans); returns & credit notes.
   - **Tax**: tax report by rate (sales tax / further tax; the FBR-ready summary layout).
   - **Receivables**: aging, customer balances, collections by period/method/account, cheque register, advances.
   - **Payables**: aging, supplier balances, payments.
   - **Purchases**: by supplier and item; PO fulfilment.
   - **Profit**: by item, category and customer (average cost).
   - **Billing**: recurring revenue.
   - **Audit**: approvals log.
3. **Superadmin** (`/admin`): organizations per industry, stores count, documents per type, active users. Category request stats.
4. **Performance**: report RPCs with indexes on `(tenant_id, store_id, created_at)`; a nightly `daily_summaries` table so year-long reports stay fast.

**Migration outline** — `…_phase31_reports.sql`:
- Report RPCs (`report_stock_valuation`, `report_item_ledger`, `report_sales`, `report_tax`, `report_receivables`, `report_payables`, `report_profit`…), all SECURITY INVOKER + permission checks.
- `daily_summaries` + cron + backfill; new indexes.
- V1 `report_data` kept.

**Affected files**:
- **Changed**: `src/app/(dashboard)/reports/**` (one page per report, shared filter bar), `src/components/reports/*`, `src/components/dashboard/*`, `src/lib/actions/reports.ts`, `src/app/admin/*`.

**Checkpoint**:
- Every report reconciles with the raw tables on a seeded dataset.
- A 100k-line seeded organization: every report < 2 s, dashboard < 1 s.
- V1 report figures are unchanged for V1 data.

---

### PHASE 33 · Hardening, Clean-up, Documentation & Release v2.0.0  *(M6)*

**Goal**: ship Version 2 safely.

**Recommended features (offered when this phase starts, §10)**: RF-33.1 Error monitoring & system health · RF-33.2 Offline view mode · RF-33.3 Backup & restore drill.

**Deliverables**
1. **Security review**:
   - An RLS coverage script: every public table has RLS on, with policies through `private.current_tenant_id()` (global tables read-only).
   - Permission tests for every RPC and role, approvals, PIN brute force.
   - Public token pages (`/share`, `/s`) leak nothing else.
   - Category write paths are superadmin-only.
   - Supabase advisors clean; reminder about leaked-password protection (the V1 open item).
2. **Performance**: index review (advisors + `pg_stat_statements`); barcode lookup p95 < 150 ms; `save_quote` p95 < 400 ms on a realistic organization.
3. **Clean-up**: drop the compat items (old impersonation header/cookie names, `vendor_name`, the old `print_format` column), dead code; regenerate types.
4. **End-to-end regression suite** (Playwright), run at the five viewports:
   - organization created per industry (categories correct)
   - superadmin category management + a category request
   - PO → GRN → bill → payment
   - quotation → order → partial DCs → invoice → receipt voucher with a cheque → statement
   - credit note
   - recurring billing run
   - the full V1 suite (draft → quotation → invoice → payment, POS slip print, A4 PDF, share, email, CSV, admin/impersonation)
5. **Documentation**:
   - `PROJECT_SPEC.md` rewritten as the ProductLogik POS spec (V1 history kept as an appendix).
   - User guide `docs/user-guide.md` (per role).
   - Superadmin guide (industries, categories, requests).
   - Hardware guide (scanners, thermal/label printers).
   - V1 → V2 migration notes.
6. **Release**: version `2.0.0`, tag `v2.0.0`, release notes.
7. **Go-live email** (product owner, 2026-10-24: Resend stays in test mode until then, so this is done during or after deployment): verify the sending domain in Resend and set `RESEND_FROM_EMAIL` to an address on it. Until then every email (invitations, category requests and results, subscription reminders, documents) only reaches the Resend account owner's address (hamzi207@gmail.com); other recipients fail with a logged error.

**Checkpoint**:
- All suites are green.
- A copy of a V1 organization upgraded through every migration shows identical V1 documents, balances, stock and categories.
- Owner sign-off.

---

## 5. NO-DOWNGRADE GUARANTEE (VERSION 1 FEATURES THAT STAY)

The upgrade must never feel like a downgrade. Everything below keeps working as it does today. The phase that touches it must re-run its V1 checks from `PROJECT_SPEC.md` §7.

| V1 feature (phase) | In V2 |
| :--- | :--- |
| Drafts / Quotations / Invoices sections, one-click conversions, numbering with prefixes and start numbers (5, 14) | Kept; new optional Sales Order and Delivery Challan steps added around them (26) |
| Document builder: customer search + inline registration, Walk-in / Cash, per-unit discounts, custom items, steppers, undo, unsaved-changes guard, phone line cards, sticky cashier bar (5, 10) | Kept; adds scan-to-add, UOM, variants, line tax, credit banner (23, 26, 29) |
| Stock reserved by quotations, deducted at invoicing (5) | Kept as the default; deduction at delivery is optional (26) |
| Payments with quick cash (+Rs. 500 / 1,000 / 5,000, Exact) and change due, pay specific lines, Mark Unpaid (5, 11) | Same dialog; now also creates a receipt voucher (29) |
| **80mm POS slip**: print from screen, slip PDF, QR to the customer link, Print / View / Download in toolbar & Share (11) | **Kept**; adds logo, empty-field skipping, 58mm option, more document types (27) |
| A4 PDF with logo, shop details, NTN/STRN, payments, status stamp, bank remittance, terms (6, 14) | Kept; restyled, more templates, empty fields skipped (27) |
| Share on WhatsApp, customer link, email to customer, payment receipt email (6, 12) | Kept, and extended to every document type (27, 30) |
| Global search (Ctrl K), notification bell, reports with CSV, dashboard widgets & date range (6) | Kept and extended (32) |
| Inventory: pagination, filters, CSV import/export with template, low-stock highlighting, margin colours (3, 9, 15) | Kept; categories become superadmin-managed (18); stock per store (20) |
| Vehicle fitment, YMM catalog, Pakistan-market vehicles (2, 3, 7) | Kept for the Automotive industry as the Vehicle Fitment module (18) |
| Customers: types, CNIC/NTN, STRN, default discount, credit days, walk-in, document history (4) | Kept; adds price lists, credit limit, ledger, statements (26, 29, 30) |
| Localization: Rs./PKR, paisa, PK phone formats, timezone, week start, dashboard clock (4) | Kept |
| Settings sections, team invites/deactivation, document numbering, bank details & wallets (14) | Kept; more roles (22), print settings per document type (27) |
| Superadmin console, impersonation, suspended shops, audit (12, 13) | Kept; becomes a full control plane: every setting, users, limits, archiving, read-only impersonation, platform data (17); industries, categories, modules (18) |
| Responsive layouts, drawer, bottom sheets, iOS zoom fix, 4K containment (8–11, 15) | Kept for every new screen |

**The one deliberate change**: organization admins can no longer edit categories (the product owner's Rev 2 decision). Their existing category trees and item categories are preserved exactly by the Phase 18 migration, and they can request changes.

---

## 6. RISKS & HOW THE PLAN HANDLES THEM

| Risk | Mitigation |
| :--- | :--- |
| Moving per-shop categories to industry catalogs changes what shops see | Path-based migration in one transaction. Unmatched categories become organization-specific, and deleted defaults become hidden. It aborts if any item's category path changes (Phase 18). |
| Organizations want a category now, but only the superadmin can add it | In-app category requests with notifications and a one-click approve (as org-specific or into the industry). |
| Integer → numeric quantity change breaks generated columns, triggers and RPC signatures | One Phase 19 migration drops and recreates the dependents; the V1 regression suite runs before anything else builds on it. |
| Per-store stock rewrite corrupts V1 stock | Backfill with a per-item sum check that aborts on mismatch; the ledger starts with `opening` rows. |
| Per-line tax changes V1 totals | V1 rate copied to each line; a full before/after totals comparison in SQL (Phase 26). |
| Ledger balances disagree with V1 "money owed" | Backfill with a per-customer reconciliation that aborts on mismatch (Phase 29). |
| Scheduled emails (statements, reminders, billing) spam or duplicate | Idempotent runs per period, the existing 100/hour/shop limit, everything in `email_logs`. |
| Scope creep across 18 phases | Each phase ships something usable and stops at its checkpoint. Phase 31 (recurring billing) and parts of Phase 32 are the most optional. |
| Repo rename breaks links / deploy | GitHub keeps redirects; the remote is updated immediately; deploy settings are listed in the Phase 16 checklist. |
| Brand green conflicting with "success" green | Phase 16 separates semantic colours from brand colours and checks contrast. |

## 7. DEPENDENCIES TO ADD (PROPOSED, VERSIONS CHECKED AT THE PHASE)

| Package | Phase | Why | Alternative |
| :--- | :--- | :--- | :--- |
| `bwip-js` *or* `jsbarcode` | 23, 27 | Code 128 / EAN-13 / UPC SVG barcodes for labels, documents, slips | Hand-rolled encoders |
| `@playwright/test` (dev) | 33 (or earlier) | End-to-end regression suite | Manual browser checklists (current practice) |
| `pg_cron` (Supabase extension) | 30–32 | Scheduled statements, reminders, billing runs, daily summaries | Run on request only |

No payment gateways, native shells or paid print services. `qrcode`, `@react-pdf/renderer`, `resend` and shadcn/Radix are reused.

## 8. OPEN QUESTIONS FOR THE PRODUCT OWNER (ANSWER ANY TIME BEFORE THE PHASE THAT NEEDS IT)

1. **Phase numbering**: continue at 16 (recommended), or restart V2 at "Phase 1"? *(Phase 16)*
2. **Product name**: keep "ProductLogik POS" as the brief says, or something closer to the new positioning (e.g. "ProductLogik Inventory & Billing")? *(Phase 16)*
3. ~~**Local folder rename** to `productlogik-pos`: do you do it by hand after Phase 16, or leave it?~~ **Decided 2026-10-20: renamed by hand to `productlogik-pos`**; `FOUNDER_SETUP_GUIDE.md` and `MAC_SETUP_CHECKLIST.md` paths updated to match. *(Phase 16)*
4. **Industry list**: are the 14 launch industries in §11.1 right (anything to add, merge or move to "later")? The category trees for the 13 new launch industries are drafted by Claude in `docs/category-templates/` for your review (Phase 18 item 8). **Drafted 2026-10-20** in `docs/category-templates/`, waiting for your review before Phase 18. *(Phase 18)*
5. ~~**Industry at sign-up**~~: answered by Rev 8. There is no self sign-up; the superadmin picks the industry in Create Organization. *(Phase 18)*
6. **Modules**: superadmin-only (planned), or may organization admins switch optional modules like Vehicle Fitment themselves? *(Phase 18)*
7. **"Billing"**: does it mean recurring/batch invoicing (Phase 31), or something else, e.g. supplier bills (Phase 25) or utility-style billing? *(Phase 25/30)*
8. **Tax**: is FBR/PRA invoice integration needed later? (The sales tax invoice and tax report are laid out to allow it.) *(Phase 26)*

9. ~~Superadmin powers: deletion or archive only?~~ **Decided 2026-10-20: archive only**, with the archive-age row colour (Phase 17).
---

## 9. MILESTONE SUMMARY

- **M1 · Phase 16**: ProductLogik POS identity, renamed repo, emerald theme, new logos/favicons/manifest, Plus Jakarta Sans.
- **M2 · Phases 17–22**: superadmin full control plane (every organization, user and setting, platform data, read-only impersonation, audit, subscription plans with manual wallet/bank payments); superadmin-managed industries and categories (organizations see only their industry's and their own); every industry gets the full system; Vehicle Fitment as an Automotive module; UOM + decimal quantities; multiple stores (all stock visible; invoicing from the current store, or other stores if the organization allows it) and a ledger; variants; five roles with manager approvals.
- **M3 · Phases 23–25**: barcodes, scan-to-add everywhere, labels; stock adjustments with reason codes, counts, transfers, average cost; suppliers, purchase orders, goods receiving, supplier bills, payments and debit notes.
- **M4 · Phases 26–28**: sales orders, delivery challans, proforma, per-line tax and sales tax invoices, price lists; a printing engine where every document shows exactly the saved business profile (POS slip kept and improved); credit notes and returns.
- **M5 · Phases 29–31**: customer ledger, receipt vouchers with allocation and advances, cheque tracking, credit limits; statements of account (PDF / slip / WhatsApp / email, bulk and scheduled), collections, supplier statements; recurring billing and batch invoicing.
- **M6 · Phases 32–33**: inventory, sales, tax, receivables and payables reports; hardening, docs, `v2.0.0`.

---

## 10. RECOMMENDED FEATURES (OFFERED WHEN EACH PHASE STARTS)

These features are **not part of the phase scope** until the product owner accepts them. They all stay within the app's scope (§0.2): no payment gateways, no native apps, no general ledger, no automated WhatsApp API.

**How it works** (§0.4): when the product owner says *"proceed with Phase N"*, Claude first lists that phase's recommended features with a short description and asks which to include. Accepted features are built **in that phase**. They're added to its deliverables and checkpoint and are subject to superadmin parity. Declined ones are marked here and not offered again, unless the product owner asks for them. They're never offered before their phase starts or built after it ends.

Status values: *Not asked yet* · *Accepted (Phase N)* · *Declined (date)*.

Ideas are drawn from what comparable inventory/invoicing products offer: customer price lists and private customer portals, kitting/BOM, lot and batch tracking, cycle counts, backorders, landed cost, and FBR digital invoicing with IRN/QR and provincial tax.

| ID | Phase | Feature | What it gives the user | Status |
| :--- | :---: | :--- | :--- | :--- |
| RF-16.1 | 16 | Organization accent colour on documents | Each organization can pick its own accent colour for its PDFs, slips (where printable), share pages and emails. The app itself stays ProductLogik emerald. | Accepted (Phase 16) |
| RF-16.2 | 16 | Urdu-ready fonts | Noto Nastaliq Urdu / Noto Sans Arabic fallbacks, so Urdu customer and product names show correctly on screens, PDFs and slips instead of empty boxes. | Accepted (Phase 16) |
| RF-16.3 | 16 | "What's new" panel | An in-app changelog after each release, so users discover V2 features (dismissible, per user). | Accepted (Phase 16) |
| RF-16.4 | 16 | Dark mode with a theme switcher | Light / Dark / System theme for the app screens, chosen in the user menu and remembered per browser. Documents (PDF, POS slip, share page, emails) stay light for printing. Requested by the product owner during Phase 16. | Accepted (Phase 16) |
| RF-17.1 | 17 | Two-factor sign-in for superadmins | Authenticator-app (TOTP) codes through Supabase MFA, required for every superadmin account. This protects the most powerful accounts. | Accepted (Phase 17) |
| RF-17.2 | 17 | Organization notes, tags & follow-ups | Private superadmin notes, tags (VIP, onboarding, fees due) and follow-up dates per organization, filterable in the Shops list. | Accepted (Phase 17) |
| RF-17.3 | 17 | Subscription tracking (no gateway) | Plan name, fee, renewal date and manually recorded payments per organization, with renewal reminders and an optional auto-suspend after a grace period. | Accepted and expanded (Rev 6, 2026-10-20): now Phase 17 deliverable 9, subscription plans & manual payments |
| RF-17.4 | 17 | Organization health score | A sortable score from recent sign-ins, documents per week and setup completeness, so inactive or struggling organizations stand out. | Accepted (Phase 17) |
| RF-17.5 | 17 | "Login As" reason & transparency | The superadmin enters a reason when impersonating. Optionally, the organization's admin sees "Support accessed your account on …" in their notifications. | Declined (2026-10-20) |
| RF-18.1 | 18 | Custom product attributes per category | Superadmin-defined fields per category or industry (e.g. Brand, Warranty months, Material, Expiry required). They appear in the product dialog, filters and CSV, and optionally on documents. This is the "optional custom attributes" idea from `docs/upgrade.md`. | Accepted (Phase 18, 2026-10-21) |
| RF-18.2 | 18 | Category images & colours | An image or colour per category in pickers, the catalog editor and category chips, for faster recognition. | Accepted (Phase 18, 2026-10-21) |
| RF-18.3 | 18 | Industry onboarding checklist | A guided setup per industry for new organizations: profile, stores, import products, opening stock, opening balances, first invoice. Progress shows for the superadmin too. | Accepted (Phase 18, 2026-10-21) |
| RF-18.4 | Later | Additional industry catalogs per organization | An organization keeps one primary industry (defaults, modules, onboarding checklist) and the superadmin can link more industry catalogs to it, e.g. a mobile shop that also sells computer items sees the Computers & IT tree and its attributes too. Needs a link table, a change to the `categories` / `category_attributes` read policies, and the picker showing which catalog a category comes from (both trees have *Others*, power and security categories). Until then: organization-specific categories and category requests. Raised by the product owner during Phase 18. | Deferred (2026-10-22): a later item, not in Phase 18; built when the product owner names it |
| RF-19.1 | 19 | Separate purchase and sale units | Buy in cartons, sell in pieces: each item has a default purchase unit used on POs/GRNs and a default sale unit used on invoices, converted automatically. | Accepted (Phase 19, 2026-10-25) |
| RF-19.2 | 19 | Customer groups & tags | Group or tag customers (e.g. "Lahore dealers", "Monthly billing") to filter lists, statements, price lists and reports. | Accepted (Phase 19, 2026-10-25) |
| RF-20.1 | 20 | Store-level price overrides | A store can sell an item at a different price from the organization's price (e.g. a mall branch). | Accepted (Phase 20, 2026-10-25) |
| RF-20.2 | 20 | Per-store numbering series | Each store numbers its own documents (e.g. `LHR1-INV-1001`). | Accepted (Phase 20, 2026-10-25) |
| RF-21.1 | 21 | Product bundles / kits | Sell a kit (e.g. "Starter Pack") as one line that deducts its component items from stock (bill of materials). | Not asked yet |
| RF-21.2 | 21 | Product image gallery | Several images per product, shown in search and on the A4 quotation/invoice and share page (optional per document type). | Not asked yet |
| RF-22.1 | 22 | Organization activity log | Org admins see who changed prices, stock, settings or documents in their organization, and when (their own audit trail). | Not asked yet |
| RF-22.2 | 22 | Two-factor sign-in for organization users | Optional authenticator-app codes per organization, which an admin can require for admins/managers. | Not asked yet |
| RF-22.3 | 22 | Sign-in hours per role | Restrict when roles can sign in (e.g. sales staff only 9am–9pm, shop time). | Not asked yet |
| RF-23.1 | 23 | Phone camera barcode scanning | Use the phone or tablet camera as a scanner in every scan field (browser BarcodeDetector + fallback library). No USB scanner needed. | Not asked yet |
| RF-24.1 | 24 | Batch / lot & expiry tracking | Record batch numbers and expiry dates on receiving. Pick earliest-expiry first on invoices, show expiry alerts and an "expiring soon" report. Important for pharmacy, grocery and cosmetics. | Moved into scope (Rev 7, 2026-10-22): now Phase 24 deliverable 6, not offered as an extra |
| RF-24.2 | 24 | Scheduled cycle counts | Automatically plan small counts (e.g. two categories a week) so the whole stock is counted over a period without closing the store. | Not asked yet |
| RF-24.3 | 24 | Stock ageing report | Shows how long stock has been sitting (0–30, 31–90, 90+ days) and its value, to spot dead money. | Not asked yet |
| RF-24.4 | 24 | Serial numbers / IMEI per unit | Items marked "serialised" record each unit's serial number (or one or two IMEIs for phones) when stock comes in: opening stock, goods receipts, transfers. The serial can be scanned. Selling such an item means choosing which serials go on the invoice line. They print on the invoice and slip for warranty. A serial can't be sold twice, and duplicate IMEIs are refused. Searching a serial shows its whole history (received, sold to whom, returned), for warranty claims and theft checks. Important for mobile phone, electronics and computer shops. Added by the product owner (Rev 7, 2026-10-22). | Not asked yet |
| RF-25.1 | 25 | Landed cost | Spread freight, customs and loading charges across the GRN lines, so item cost and margin are true. | Not asked yet |
| RF-25.2 | 25 | Auto-draft purchase orders | Reorder suggestions turn into draft POs per supplier on a schedule, ready to review and send. | Not asked yet |
| RF-25.3 | 25 | Supplier price history & comparison | The cost history per item and supplier, and the cheapest recent supplier, shown when creating a PO. | Not asked yet |
| RF-26.1 | 26 | Backorders | When an order can't be fully delivered, the rest stays on backorder. The team is alerted when stock arrives, and it's delivered and invoiced later. | Not asked yet |
| RF-26.2 | 26 | Multiple addresses & contacts per customer | Several delivery addresses and contact people per customer, chosen per document. | Not asked yet |
| RF-26.3 | 26 | Document attachments | Attach files to documents (customer PO, signed challan, photos), stored privately in Supabase Storage. | Not asked yet |
| RF-26.4 | 26 | FBR digital invoicing integration | Send sales tax invoices to FBR's digital invoicing system, print the returned IRN and QR, validate NTN/STRN, and handle provincial rates (PRA/SRB). Needs the organization's FBR credentials. | Not asked yet |
| RF-26.5 | 26 | Customer-specific item codes | Show the customer's own item code/name on their documents next to yours. | Not asked yet |
| RF-27.1 | 27 | Bilingual documents (English + Urdu) | Labels on PDFs and slips in both languages, per organization or per customer. | Not asked yet |
| RF-27.2 | 27 | Signature & stamp images | Upload an authorised signature and company stamp, printed on invoices, challans and statements. | Not asked yet |
| RF-27.3 | 27 | Custom document fields | Extra fields per document type (e.g. "Project", "Vehicle No.", "Site") shown on screen and in print. | Not asked yet |
| RF-27.4 | 27 | Watermarks | DRAFT / COPY / PAID / CANCELLED watermarks on PDFs and reprints. | Not asked yet |
| RF-28.1 | 28 | Return requests from the customer link | Customers request a return on the shared document page. Staff approve it, and that turns it into a credit note. | Not asked yet |
| RF-28.2 | 28 | Return reasons analytics | A report of returns by reason, product and supplier, to spot defects. | Not asked yet |
| RF-29.1 | 29 | Customer portal | One private link per customer showing all their invoices, statement, balance and downloadable PDFs. | Not asked yet |
| RF-29.2 | 29 | Bank statement import & matching | Import the bank's CSV statement and match deposits to receipt vouchers and cheques, flagging unmatched lines. | Not asked yet |
| RF-29.3 | 29 | Late payment charges | An optional fee or interest on overdue balances, added as a customer debit note with approval. | Not asked yet |
| RF-30.1 | 30 | Reminder sequences (dunning) | Automatic reminder steps: 3 days before due, on the due date, then 7/15/30 days after. By email automatically, and as a WhatsApp click-to-send queue. | Not asked yet |
| RF-30.2 | 30 | Editable message templates | The organization's own WhatsApp/email wording with placeholders (customer, amount, due date, link), including Urdu. | Not asked yet |
| RF-31.1 | 31 | Usage / meter-based billing | Enter readings or quantities per customer before a billing run (utility-style or usage billing). | Not asked yet |
| RF-31.2 | 31 | Proration | Charge partial periods when a schedule starts, stops or changes mid-cycle. | Not asked yet |
| RF-31.3 | 31 | Contract renewal reminders | Alerts before recurring schedules end, so contracts are renewed on time. | Not asked yet |
| RF-32.1 | 32 | Scheduled report emails | Daily sales, weekly receivables or monthly stock reports emailed to chosen users. | Not asked yet |
| RF-32.2 | 32 | Saved report views | Save filters and columns per report, per user. | Not asked yet |
| RF-32.3 | 32 | Excel export & accountant packs | `.xlsx` export, plus a monthly pack (sales, purchases, receipts, payments) in CSV layouts that common accounting tools import. | Not asked yet |
| RF-33.1 | 33 | Error monitoring & system health | Error tracking and uptime alerts, plus a superadmin "System health" page (errors, slow queries, email failures). | Not asked yet |
| RF-33.2 | 33 | Offline view mode | Recently opened documents, customers and stock stay viewable when the internet drops (read-only; no offline editing). | Not asked yet |
| RF-33.3 | 33 | Backup & restore drill | A documented and tested restore process (Supabase point-in-time recovery) and scheduled per-organization exports. | Not asked yet |

---

## 11. INDUSTRIES THAT CAN USE PRODUCTLOGIK POS

ProductLogik POS fits any business that **buys, stocks and sells physical products**, invoices customers, gives credit and needs statements of account, whether retail, wholesale, trade or B2B supply. Some service-plus-parts businesses fit too. Every industry gets the full system (Phase 18); the industry only decides the category catalog, default units, starting settings and default modules.

- **Launch** industries are seeded in Phase 18, each with a reviewed category tree.
- **Later** industries can be added by the superadmin at any time in `/admin/industries`, with a tree built in the console or imported from CSV. No code is needed. Claude can draft a tree when one is requested.

### 11.1 Launch industries (seeded in Phase 18)

| # | Industry | Typical products | Features that matter most |
| :--- | :--- | :--- | :--- |
| 1 | **General Retail & Departmental Stores** | Household goods, plastics, kitchen items, gifts, mixed merchandise | Barcodes & labels, variants, multi-store stock, POS slip, quick walk-in invoices |
| 2 | **Supermarket, Grocery & Kiryana** | Atta, rice, daal, oil & ghee, spices, beverages, snacks, dairy, cleaning, personal care | Decimal kg/litre quantities, pack/carton units, barcodes, low-stock & reorder, supplier POs, customer khata |
| 3 | **Wholesale & FMCG Distribution** | Cartons/packs of branded consumer goods supplied to retailers | Sales orders, delivery challans, price lists (distributor / retailer), credit limits, receipt vouchers, cheques, statements of account, collections |
| 4 | **Apparel & Footwear** | Men/women/kids clothing, shalwar kameez, unstitched suits, shoes, accessories | Variants (size × colour), barcode labels, multi-store stock with transfers, returns & exchanges |
| 5 | **Textile, Fabric & Cloth Houses** | Lawn, cotton, khaddar, wash & wear, bedsheets, towels (by meter, than, piece) | Meter/yard decimal quantities, roll/than units, wholesale price lists, delivery challans, khata |
| 6 | **Electronics, Mobile Phones & Accessories** | Phones, chargers, cables, covers, home appliances, small electronics | Variants (model × colour × capacity), barcodes, serial numbers / IMEI (RF-24.4), warranty info on documents, multi-store stock |
| 7 | **Computers & IT Equipment** | Laptops, parts, networking, printers, toner, CCTV | B2B quotations → orders → delivery challans, sales tax invoices, supplier bills, serial numbers (RF-24.4), recurring maintenance billing |
| 8 | **Pharmacy & Medical Supplies** | Medicines, surgical items, medical devices, OTC products | Batch & expiry tracking (Phase 24), packs/strips/tablets units, supplier purchasing, tax categories |
| 9 | **Cosmetics, Beauty & Personal Care** | Skin care, makeup, fragrances, salon supplies | Variants (shade, size), expiry (Phase 24), barcodes, retail + wholesale price lists |
| 10 | **Hardware, Building Materials & Sanitary** | Tools, fasteners, paint, cement, pipes, fittings, sanitary ware, tiles | Many UOMs (bag, kg, ft, box, sq ft), contractor credit accounts, delivery challans, statements |
| 11 | **Electrical & Lighting** | Cables (by meter/coil), switches, breakers, lights, fans, solar accessories | Meter/coil units, price lists for electricians/contractors, project quotations, credit control |
| 12 | **Automotive Accessories & Parts** *(existing V1 shops)* | Car accessories, parts, tint/wrap/PPF, audio, lighting, care products | Vehicle Fitment module (YMM), quotations, POS slip — all V1 behaviour kept |
| 13 | **Books, Stationery & School Supplies** | Books, copies, office stationery, school uniforms & bags | Barcodes/ISBN, bulk school orders, delivery challans, seasonal stock, institution accounts |
| 14 | **Toys, Gifts & Party Supplies** | Toys, gift items, decorations, party goods | Variants, barcode labels, seasonal reorder, retail + wholesale prices |

### 11.2 Later industries (the superadmin can add them when there's demand)

| Industry | Typical products | Why it fits / what it uses |
| :--- | :--- | :--- |
| **Solar & Energy Equipment** | Panels, inverters, batteries, structures, cables | Quotations for projects, delivery challans, installation as service lines, recurring maintenance billing |
| **Water, LPG & Gas Cylinder Distribution** | Water bottles, LPG cylinders, refills | Recurring delivery billing (Phase 31), usage-based lines (RF-31.1), customer khata, statements |
| **Furniture & Home Décor** | Furniture, mattresses, curtains, décor | Orders with advance payments, delivery challans, variants (size/finish) |
| **Kitchenware, Crockery & Home Appliances** | Cookware, crockery sets, small appliances | Variants, sets/kits (RF-21.1), wholesale price lists |
| **Paints, Chemicals & Coatings** | Paints by litre/gallon/drum, chemicals, adhesives | Decimal volumes, batch tracking (Phase 24), dealer credit accounts |
| **Agriculture Inputs** | Seeds, fertilizer, pesticides, sprayers, farm tools | Bag/kg/litre units, batch & expiry, seasonal credit to farmers with statements |
| **Veterinary & Pet Supplies** | Animal medicines, feed, pet food & accessories | Batch & expiry, bag/kg units, dealer credit |
| **Industrial Supplies & Tools** | Bearings, belts, valves, safety equipment, lubricants | B2B quotations → orders, price lists per client, sales tax invoices, supplier bills |
| **Steel, Pipes & Metals** | Steel bars, sheets, pipes, angles (by kg, ton, foot) | Weight/length decimal units, delivery challans, contractor credit |
| **Tiles, Marble & Stone** | Tiles, marble slabs, granite (by sq ft, box) | Sq ft / box conversions, project quotations, delivery challans |
| **Packaging, Plastics & Disposables** | Boxes, shopping bags, disposables, labels | Carton/pack units, distributor price lists, recurring supply billing |
| **Paper, Printing & Office Supplies** | Paper reams, inks, toner, office consumables | Recurring supply to offices, corporate accounts, statements |
| **Sports & Fitness** | Sports goods, gym equipment, sportswear | Variants, barcodes, institution orders |
| **Bicycles & Motorcycle Parts** | Parts, tyres, accessories, lubricants | Fitment-style compatibility (could reuse the Vehicle Fitment module for motorcycles), workshop service lines |
| **Optical Stores** | Frames, lenses, contact lenses, solutions | Variants (frame × colour), orders with advance, service lines (fitting) |
| **Jewellery Accessories & Watches** *(non-gold)* | Artificial jewellery, watches, accessories | Variants, barcode labels, multi-store stock. (Gold trading with live rates is out of scope.) |
| **Uniforms & Workwear** | School/corporate uniforms, safety wear | Variants (size), bulk institution orders, delivery challans, recurring billing |
| **Surgical & Dental Instruments (suppliers)** | Instruments, consumables | Batch tracking, B2B quotations, sales tax invoices |
| **Event & Equipment Rental (light)** | Chairs, tents, tools, equipment | Recurring billing, delivery challans out / returns in. (Booking calendars are out of scope.) |
| **Service businesses that sell parts** | AC/fridge repair, IT services, maintenance contractors | Service + part lines, quotations, recurring maintenance contracts (Phase 31), statements |

### 11.3 Poor fits (not targeted; would need features outside the scope)

| Business | Why not |
| :--- | :--- |
| Restaurants, cafés, cloud kitchens | Table service, kitchen orders and recipe-based stock deduction (out of scope; the checkout register is Appendix A) |
| Supermarket checkout lanes at scale | Needs the dedicated cashier register, shifts and cash drawer (Appendix A, not scheduled) |
| Hospitals, clinics, labs | Patient records and appointments |
| Hotels & hospitality | Rooms, bookings and folios |
| Manufacturing with production orders | Production planning, work orders and work in progress (only simple kits via RF-21.1) |
| Fuel stations | Pump/nozzle meter readings and shift reconciliation |
| Gold & bullion jewellers | Live gold rates, karat/weight pricing and making charges |
| Pure online stores | Need a public storefront and online payments (gateways are out of scope) |

---

## APPENDIX A · CHECKOUT-REGISTER FEATURES (FROM `docs/upgrade.md`, NOT SCHEDULED)

Moved out of Version 2 by the product owner on 2026-10-20 (the target is inventory, invoicing, SOA and billing, not supermarket checkout). They're kept here so they aren't lost, and could form a later optional "Counter Sales" module on top of V2's foundations (stores, roles, barcodes, ledger, print engine). Nothing in V2 blocks them.

> **Not planned (product owner, 2026-10-22, Rev 7)**: ProductLogik POS is a hosted web app. It can't be hosted locally at the counter, and over the internet a scan-and-pay checkout queue would be too slow. Counter needs are covered by walk-in invoices, barcode scanning (Phase 23) and the POS slip.

- **Dedicated `/pos` cashier screen**: full-screen register, quick-pick grid with category tabs and favourites, keyboard shortcuts, customer-facing display.
- **Park / hold carts**: suspend and resume sales.
- **Tender modal**: split tender (cash + card + store credit).
- **Cash drawer kick**: through the printer driver or ESC/POS.
- **Register shifts**: opening float, pay-in/pay-out, X-report, Z-report with over/short variance.
- **Registers/tills per branch**: device pairing.
- **Screen lock and cashier fast-switch** with a 4-digit PIN. (V2 has approver PINs only.)
- **Scale / weight-embedded barcodes** for supermarket scales.
- **Loyalty points and promotional discount codes**, automatic promotions (BOGO).
- **Network-tolerant checkout**: local cart persistence, idempotent sale submission.

> **HALTED.** Waiting for: *"Plan approved, proceed with Phase [X]"*.
