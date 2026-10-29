# PROJECT_SPEC.md: Master Architecture & Implementation Specification
## ProductLogik POS: Multi-Industry B2B SaaS for Inventory, Invoicing & Billing
*(Version 1, Phases 1–15, was CarShop.Pk POS for automotive accessory sellers; tag `v1.0.0`.)*

> **Document Status**: Production Blueprint / Master Instruction Manual  
> **Target Audience**: AI Coding Agents (Claude Code, Antigravity) & Lead Engineers  
> **Application Type**: Multi-Tenant B2B SaaS (Cloud POS & Quoting Engine)  
> **Release Target**: Phase 1 MVP (Inventory, Quoting, Customer Directory, YMM Engine)
> **Current Standing (2026-10-25)**: Version 1 (Phases 1–15) is built, committed and tagged `v1.0.0`. Version 2 (ProductLogik POS, Phases 16–33) follows `docs/upgrade-plan.md`; Phase 16 (rebrand, accent colour, Urdu/Arabic PDFs, What's new, dark mode, `e06086c`), Phase 17 (superadmin console, subscriptions, billing, separate superadmin accounts, `c2e0079`), Phase 18 (industries, superadmin category catalogs, attributes, onboarding; no self sign-up, `fd19c84`) and Phase 19 (units of measure, decimal quantities, customer types and tags) are built (§7); Phases 20–33 are next, one at a time. Sections 1–6 are the original blueprint. §7 records exactly what each completed phase built (the app as it is today) and §8 lists only what is still to build; where §1–6 differ (e.g. the schema in §3, `process_quote_payment`, the vehicle picker on quotes), §7 and `supabase/migrations/` are authoritative.

---

## 1. PROJECT OVERVIEW & ARCHITECTURE

### 1.1 Product Vision
**Version 2 (ProductLogik POS)**: the product is a general-purpose inventory, invoicing, statements-of-account and billing system for retail and wholesale businesses across many industries (grocery, apparel, electronics, hardware, pharmacy, automotive and more; see `docs/upgrade-plan.md` §11). Each organization picks an industry and gets that industry's category tree, with every feature available to every industry. Automotive Year/Make/Model fitment stays available as an optional product attribute. The goal is accurate stock and fast, professional documents (A4 PDF and 80mm slip), not supermarket-style checkout; register, shift and loyalty features are unscheduled (upgrade plan Appendix A). Nothing from Version 1 is removed.

The original Version 1 vision follows.

Car accessory sellers and retailers (distributing window tint rolls, vehicle vinyl wraps, paint protection film [PPF], 12V audio electronics, lighting, and aftermarket styling accessories) operate in a fast-paced environment where parts, accessories, and film rolls are strictly vehicle-specific.

While these businesses are primarily **sellers and retailers** (supplying walk-in retail customers, wholesale dealership accounts, and commercial fleet clients), some shops also offer optional on-site fitting or installation services from time to time. A standard general-purpose POS fails because it lacks **Year/Make/Model (YMM)** compatibility checks, product fitment filtering, and the flexibility to seamlessly quote physical products with or without optional service/labor charges.

**Phase 1 Objective**: Deliver a streamlined, lightning-fast B2B Inventory Management and Quoting engine tailored for automotive accessory sellers, retail shops, and specialty aftermarket distributors (with support for optional installation/labor services when offered). 

### 1.2 Technology Stack
| Layer | Technology | Selection Rationale |
| :--- | :--- | :--- |
| **Framework** | **Next.js 14+ (App Router)** | Server Components for instant load speeds, Server Actions for mutations, optimal SEO and routing. |
| **Language** | **TypeScript (Strict Mode)** | End-to-end type safety across database entities, API contracts, and UI components. |
| **Styling** | **Tailwind CSS** | Utility-first styling with tight design tokens, zero runtime overhead. |
| **UI Components** | **shadcn/ui + Radix UI** | Accessible, headless, customizable primitives (Dialog, Select, Command, Popover, Table, Toasts). |
| **Icons** | **Lucide React** | Consistent, lightweight SVG icon system. |
| **State & Forms** | **React Hook Form + Zod** | High-performance schema-validated form state management. |
| **Database & Auth** | **Supabase (PostgreSQL + Auth)** | Managed PostgreSQL with native Row Level Security (RLS), real-time primitives, and JWT auth. |
| **Document Engine** | **@react-pdf/renderer** | Deterministic, pixel-perfect vector PDF generation for quotes and invoices. |
| **Email Engine** | **Resend** | High-deliverability transactional email delivery for onboarding, password resets, quotes/invoices, receipts, and staff invites. |
| **External Data** | **NHTSA vPIC API** | Free, authoritative US Department of Transportation vehicle database for Year/Make/Model cataloging. |

### 1.3 Supabase Project Configuration & AI Tooling
- **Supabase Project Reference ID**: `sgdbhdmsvfmqxlpkrgez`
- **Project URL**: `https://sgdbhdmsvfmqxlpkrgez.supabase.co`
- **Region**: `eu-central-1` (Frankfurt), next to the production VPS. Moved on 26 Oct 2026 from project `atjbxwhvtattwiivrqbe` in `ap-southeast-2` (Sydney), where every query from Pakistan took ~350 ms: schema rebuilt from the 89 migrations, data, sign-in accounts (passwords + 2FA) and storage restored from a `pg_dump` backup, row counts verified.
- **Supabase MCP Server (For Claude Code & Cursor)**:
  ```bash
  claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=sgdbhdmsvfmqxlpkrgez&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
  ```
- **Supabase Agent Skills**:
  ```bash
  npx skills add supabase/agent-skills
  ```
  *Empowers AI coding agents with direct Supabase CLI commands, schema inspection, database debugging, and type generation.*

### 1.4 UI Reference Implementation: Figma Code Export (`./design/figma-ui/`)
The visual design for this application has already been generated from the Figma prompt and is saved as a complete, working React + Tailwind CSS project in the repository:
- **Location**: `./design/figma-ui/`
- **Master UI Component**: `design/figma-ui/src/App.tsx` (Contains complete interactive screens, navigation, layout, modals, and status badges for Dashboard, Quotes, Inventory, and Customers).
- **Design Tokens & Theme CSS**: `design/figma-ui/src/index.css` (Contains the exact color tokens, dark slate structure, badges, buttons, and responsive styles).
- **Directive for Claude Code / Antigravity**: Use `./design/figma-ui/` as the visual and component reference. Port, modularize, and adapt these components into the Next.js App Router structure in `src/app/` and `src/components/`. Do not reinvent the UI from scratch!

---

### 1.5 Multi-Tenant Architecture & The RLS "Digital Lock"
The application uses a **Shared Database, Shared Schema, Row-Level Isolation** architecture. Every business operating on the platform is assigned an isolated `tenant_id` (UUID). 

```
                                  [ Incoming Request ]
                                           │
                                  [ Supabase Auth JWT ]
                                           │
                           (Extracts auth.uid() -> tenant_id)
                                           │
                ┌──────────────────────────┴──────────────────────────┐
                ▼                                                     ▼
     ┌───────────────────────┐                             ┌───────────────────────┐
     │  Shop A (Tenant A)    │                             │  Shop B (Tenant B)    │
     │  Quotes & Inventory   │                             │  Quotes & Inventory   │
     └───────────────────────┘                             └───────────────────────┘
                ▲                                                     ▲
                └────────────── [ PostgreSQL RLS ENGINE ] ────────────┘
                              "Digital Lock" Prevents Any
                              Cross-Tenant Data Leakage
```

#### How the "Digital Lock" Works:
1. **User Membership**: Every authenticated user in `auth.users` maps to a record in `public.profiles`, containing a foreign key `tenant_id` pointing to `public.tenants`.
2. **Context Helper Function**: A PostgreSQL security definer function `current_tenant_id()` extracts the tenant ID belonging to the caller:
   ```sql
   create or replace function public.current_tenant_id()
   returns uuid as $$
     select tenant_id from public.profiles where id = auth.uid();
   $$ language sql stable security definer;
   ```
3. **Row Level Security (RLS) Enforcement**: Every multi-tenant table (`inventory_items`, `customers`, `quotes`, etc.) has a mandatory `tenant_id` column and an active RLS policy:
   ```sql
   alter table public.inventory_items enable row level security;

   create policy "Tenant isolation for inventory_items"
   on public.inventory_items
   for all
   using (tenant_id = public.current_tenant_id())
   with check (tenant_id = public.current_tenant_id());
   ```
4. **Leak-Proof Guarantee**: Even if an attacker manipulates API requests, queries the database directly with client-side Supabase tokens, or exploits a frontend bug, PostgreSQL physically blocks access to rows belonging to any other `tenant_id`.

---

## 2. CORE FEATURES TO BUILD (STRICT SCOPE)

### 2.1 Scope Boundary Matrix
AI agents implementing this project must adhere strictly to the boundaries defined below.

| Category | IN SCOPE (Build This) | OUT OF SCOPE (DO NOT BUILD) |
| :--- | :--- | :--- |
| **Payments** | Manual payment logging (Cash, Bank Transfer, Card Terminal, Check), quick cash buttons, 80mm thermal POS receipt printing. | **NO** Stripe, PayPal, Square, or online payment gateways. |
| **Industries** | Any retail/wholesale trade: superadmin-managed industries and category trees, org-specific categories, every feature for every industry. | **NO** industry-locked feature tiers. |
| **Inventory** | On-hand quantity, low-stock threshold alert, Cost price, Retail price, SKU, optional YMM fitment vs Universal Fit, CSV bulk import/export; V2 adds variants, units of measure, barcodes, multiple stores per org, purchase orders and returns (see `docs/upgrade-plan.md`). | **NO** bin/aisle tracking, RFID hardware, or serial number tracking. |
| **Vehicle Data** | Optional: NHTSA vPIC Year, Make, Model selection (model years 1960–2026) for organizations that use fitment. | **NO** complex 17-digit VIN decoding, engine code lookups, or OBD-II diagnostics. |
| **Branding & Display** | ProductLogik brand, per-organization accent colour on documents, light and dark mode for the app (documents stay light), Urdu/Arabic text in PDFs, PWA install. | **NO** per-organization custom app themes beyond the accent colour. |
| **Messaging & Email** | WhatsApp click-to-chat links with pre-composed text/PDF links + Resend transactional email engine. | **NO** Twilio WhatsApp Business API or automated SMS webhooks. |
| **Quoting & POS** | Line items for physical inventory products + optional labor/service fees, discounts, tax rate, PDF generation, status pipeline, 80mm thermal receipts. | **NO** complex multi-tiered commission splits or recurring billing subscriptions. |
| **Platform Administration** | Superadmin Control Plane (`/admin`) for SaaS owners to manage tenants, users, company details, password resets, and support impersonation. | **NO** public access; strictly guarded by `is_superadmin` flag. |
| **Device Compatibility** | Adaptive responsive design across Mobile, Tablet, Laptop, Desktop, and Ultrawide/4K displays with touch ergonomics. | **NO** native iOS/Android binary apps (PWA / responsive web app). |

---

### 2.2 Feature Specifications

#### Feature A: Multi-Shop Authentication & Settings
- **Shop Registration**: Sign up with Owner Name, Email, Password, and Shop Name. Creates a `tenants` row and a linked `profiles` row with the `admin` role.
- **Shop Profile & Settings**:
  - Shop Name, Physical Address, Contact Phone, Support Email.
  - Shop Logo upload (stored in Supabase Storage bucket `shop-assets`).
  - Tax Rate / VAT % (e.g., 8.25% or 20%).
  - Quote Disclaimer & Terms (e.g., *"All tint warranties require 48 hours cure time without rolling windows down"*).
  - Currency: `Rs.` (default) or `PKR`, chosen per shop. See §2.3.
  - Timezone: `Asia/Karachi` (Islamabad / Karachi, PKT) by default. See §2.3.
  - International phone numbers: off by default; shops with overseas clients can switch it on. See §2.3.
- **User Management**: Admins can invite staff members to their shop tenant via email.

#### Feature B: The YMM Inventory Engine
- **Item Fields**:
  - `sku`: Unique item code (auto-generated or manual).
  - `name`: e.g., "Ceramic IR Window Film 20% - 40in x 100ft", "Avery Dennison Gloss Black Vinyl", "Focal 6.5\" Component Speakers".
  - `category`: Preset categories (`Window Film`, `Vinyl Wrap`, `PPF`, `Car Audio`, `Accessories`, `Hardware / Chemicals`).
  - `cost_price`: Wholesale purchase price.
  - `selling_price`: Retail price charged to customer.
  - `quantity_on_hand`: Current physical stock level.
  - `low_stock_threshold`: Default is 5. When `quantity_on_hand <= low_stock_threshold`, visual warning badges appear.
  - `is_universal`: Boolean flag.
- **Compatibility Engine**:
  - If `is_universal = true`, the item is available for every vehicle quote.
  - If `is_universal = false`, the item must be mapped to one or more `vehicles` records via the `item_vehicle_compatibility` junction table.

#### Feature C: B2B Customer Directory
- **Client Profiles**:
  - Client Name / Company Name (e.g., "Apex Auto Dealership", "Metro Fleet Logistics", "John Smith").
  - Customer Type: `Dealership`, `Fleet Account`, `Retail Customer`.
  - Contact Person & Position.
  - WhatsApp Number: Required. Pakistani mobile in local format by default (e.g., `0300-1234567`); international `+` numbers only when the shop allows them. See §2.3.
  - Email Address.
  - Billing Address & Tax ID / VAT Number.
  - Customer History View: Chronological list of all past quotes and invoices with payment status.

#### Feature D: Quoting & Invoicing Pipeline (The Core Engine)
1. **Quote Creation Wizard**:
   - **Step 1: Customer Selection**: Searchable dropdown of existing customers or quick modal to create a new one.
   - **Step 2: Vehicle Selection**: Cascading dropdowns: `Year` -> `Make` -> `Model`. (Optional: Freeform notes for sub-trim, e.g., "M Sport Package").
   - **Step 3: Magic Fit Inventory Filtering**: When a vehicle is selected, the inventory selection table automatically filters to show:
     $$\text{Visible Items} = \{ \text{Items where } is\_universal = \text{true} \} \cup \{ \text{Items mapped to chosen Vehicle ID} \}$$
   - **Step 4: Optional Labor & Services**: For sellers that offer fitting/installation as an add-on, allow adding custom service/labor line items (e.g., "Installation Labor - 2 Hours", "Custom Fitting Fee"). For parts-only sellers, quotes are generated purely from physical inventory parts without any labor items.
   - **Step 5: Dynamic Totals**: Subtotal, line-item discounts, shop tax rate calculation, and grand total.
2. **Status Pipeline**:
   - Status transitions: `draft` $\rightarrow$ `sent` $\rightarrow$ `accepted` $\rightarrow$ `invoiced` $\rightarrow$ `paid` (or `cancelled`).
   - Shown to users as three separate sections, **Drafts**, **Quotations** and **Invoices**, with one-click conversions (Draft → Quotation or Invoice, Quotation → Invoice). See §7 Phase 5.
3. **One-Click Professional PDF Generation**:
   - Clean, automotive-branded PDF invoice/quote template generated on demand.
   - Includes Shop Logo, Shop Details, Customer Details, Vehicle YMM, Itemized Table (Parts & Labor), Totals, and Disclaimer.
4. **Direct WhatsApp Sharing**:
   - A single-click button: `"Share via WhatsApp"`.
   - Generates a `https://wa.me/{phone}?text={encoded_message}` deep link.
   - Pre-fills a professional message containing: Shop Name, Quote Number, Vehicle Details, Total Amount, and a secure public view link for the PDF.
5. **Manual Payment** (changed by `docs/changes.md` §5: stock now moves with the document stage, not with payment):
   - Stock: quotations reserve their parts (`inventory_items.reserved_quantity`); issuing an invoice (directly or from a quotation) releases any reservation and deducts `quantity_on_hand`. Drafts hold nothing. Cancelling, deleting or moving a quotation back to drafts releases its reservation. Nothing can take more than is available (on hand − reserved). This is enforced by the `quote_items_sync_stock` trigger, so `quotes.inventory_deducted` simply mirrors "invoiced or paid".
   - Payments (built with `docs/changes.md` round 2): each payment is a row in `invoice_payments` (amount, method `Cash` / `Card Terminal` / `Bank Transfer` / `Check`, date, notes). A trigger keeps `quotes.amount_paid`, and the invoice becomes `paid` automatically once payments cover the total (`process_quote_payment` was removed). Payments never touch stock.
   - Invoice statuses shown: **Pending / Unpaid**, **Partially Paid** (some payments), **Due** (unpaid after `due_date`: the invoice date + the customer's `credit_days`, editable per invoice), **Paid**, **Cancelled** (stored as `void`; its stock is given back).
   - "Mark Unpaid" removes an invoice's payments. Anything without payments (drafts, quotations, unpaid or cancelled invoices) can be deleted, which gives back any stock it held.
   - Lines: inventory parts are sold at their inventory price (fixed); the discount is per unit (% or Rs.); sale price = unit price − discount; line total = qty × sale price. Custom items not in inventory can be added with their own price and don't affect stock. Vehicles are no longer chosen on documents.

### 2.3 Localization: Pakistan (Default Market)
The product targets Pakistani shops and sellers first. These defaults apply to every shop; the per-shop options are set on the shop Settings page.

| Setting | Default | Per-shop option |
| :--- | :--- | :--- |
| **Currency** | `Rs.` | `Rs.` or `PKR` (no other currencies) |
| **Timezone** | `Asia/Karachi` (PKT, UTC+5; covers Islamabad and Karachi) | Any IANA timezone, chosen in Settings |
| **Phone numbers** | Pakistani local format starting with `0` | Allow international numbers with a `+` country code |

- **Currency display**: symbol, a space, then the amount with thousands separators: `Rs. 12,500.00` / `PKR 12,500.00`.
- **Timezone**: all dates and times shown to users (quote dates, paid-at, "today" on the dashboard) are rendered in the shop's timezone. The database keeps storing `timestamptz` (UTC).
- **Phone numbers**:
  - **Pakistani numbers (always accepted)**: entered in local format starting with `0`. Mobiles are 11 digits starting `03` (e.g., `0300-1234567`). Landlines are 10–11 digits with an area code (e.g., `051-1234567`, `042-35123456`). Spaces, dashes and brackets are ignored. `+92` / `0092` / `92` forms are accepted and converted to the `0` format.
  - **WhatsApp number**: must be a mobile (`03…`) when Pakistani, since landlines can't use WhatsApp.
  - **International numbers**: accepted only when the shop has switched on international numbers, entered with a `+` country code (e.g., `+971501234567`, E.164: `^\+[1-9]\d{7,14}$`).
  - **Storage**: numbers are stored normalized in E.164 (`+923001234567`), so WhatsApp links (`https://wa.me/923001234567`) work for local and international clients alike. Pakistani numbers are always displayed back in local format (`0300-1234567`).

---

## 3. DATABASE SCHEMA & ROW LEVEL SECURITY (RLS)

### 3.1 PostgreSQL DDL (Full Schema)

```sql
-- =============================================================================
-- 1. EXTENSIONS & SETUP
-- =============================================================================
create extension if not exists "uuid-ossp";

-- =============================================================================
-- 2. TENANTS TABLE (Each auto shop is a tenant)
-- =============================================================================
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  logo_url text,
  address text,
  phone text,
  email text,
  currency text not null default '$',  -- Phase 4: changed to 'Rs.' and limited to 'Rs.' / 'PKR' (§2.3)
  tax_rate numeric(5,2) not null default 0.00,
  quote_footer_notes text default 'All quotes are valid for 30 days. 50% deposit required on custom orders.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 3. USER PROFILES TABLE (Linked to Supabase Auth)
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff')) default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for RLS speed
create index idx_profiles_tenant_id on public.profiles(tenant_id);

-- Helper function to fetch current tenant id in RLS policies
create or replace function public.current_tenant_id()
returns uuid as $$
  select tenant_id from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- =============================================================================
-- 4. VEHICLES MASTER TABLE (Global reference data - NOT tenant-specific)
-- =============================================================================
create table public.vehicles (
  id serial primary key,
  year integer not null check (year between 1980 and 2035),
  make text not null,
  model text not null,
  trim text,
  created_at timestamptz not null default now(),
  constraint uq_vehicle_ymm unique (year, make, model, trim)
);

create index idx_vehicles_lookup on public.vehicles(year, make, model);

-- =============================================================================
-- 5. INVENTORY ITEMS TABLE (Tenant-specific)
-- =============================================================================
create table public.inventory_items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category text not null check (category in ('Window Film', 'Vinyl Wrap', 'PPF', 'Car Audio', 'Accessories', 'Hardware / Chemicals')),
  cost_price numeric(10,2) not null check (cost_price >= 0),
  selling_price numeric(10,2) not null check (selling_price >= 0),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  low_stock_threshold integer not null default 5,
  is_universal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tenant_sku unique (tenant_id, sku)
);

create index idx_inventory_tenant on public.inventory_items(tenant_id);
create index idx_inventory_universal on public.inventory_items(tenant_id, is_universal);

-- =============================================================================
-- 6. ITEM-VEHICLE COMPATIBILITY JUNCTION TABLE
-- =============================================================================
create table public.item_vehicle_compatibility (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  vehicle_id integer not null references public.vehicles(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint uq_item_vehicle unique (tenant_id, item_id, vehicle_id)
);

create index idx_compat_lookup on public.item_vehicle_compatibility(tenant_id, vehicle_id, item_id);

-- =============================================================================
-- 7. CUSTOMERS TABLE (Tenant-specific)
-- =============================================================================
create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  customer_type text not null check (customer_type in ('Dealership', 'Fleet Account', 'Retail Customer')) default 'Retail Customer',
  contact_person text,
  phone text,
  whatsapp_number text not null,
  email text,
  billing_address text,
  tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_tenant on public.customers(tenant_id);
create index idx_customers_whatsapp on public.customers(tenant_id, whatsapp_number);

-- =============================================================================
-- 8. QUOTES & INVOICES TABLE (Tenant-specific)
-- =============================================================================
create table public.quotes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_number text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id integer references public.vehicles(id) on delete set null,
  custom_vehicle_notes text,
  status text not null check (status in ('draft', 'sent', 'accepted', 'invoiced', 'paid', 'cancelled')) default 'draft',
  subtotal numeric(10,2) not null default 0.00,
  tax_rate numeric(5,2) not null default 0.00,
  tax_amount numeric(10,2) not null default 0.00,
  discount_amount numeric(10,2) not null default 0.00,
  total_amount numeric(10,2) not null default 0.00,
  payment_method text check (payment_method in ('Cash', 'Card Terminal', 'Bank Transfer', 'Check')),
  payment_notes text,
  paid_at timestamptz,
  inventory_deducted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tenant_quote_number unique (tenant_id, quote_number)
);

create index idx_quotes_tenant_status on public.quotes(tenant_id, status);
create index idx_quotes_customer on public.quotes(customer_id);

-- =============================================================================
-- 9. QUOTE LINE ITEMS TABLE
-- =============================================================================
create table public.quote_items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  is_labor boolean not null default false,
  quantity numeric(10,2) not null default 1.00 check (quantity > 0),
  unit_cost numeric(10,2) not null default 0.00,
  unit_price numeric(10,2) not null default 0.00,
  total_price numeric(10,2) not null default 0.00,
  created_at timestamptz not null default now()
);

create index idx_quote_items_quote on public.quote_items(quote_id);
```

---

### 3.2 Row Level Security (RLS) Implementation

```sql
-- Enable RLS across all tenant-bound tables
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.item_vehicle_compatibility enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

-- -----------------------------------------------------------------------------
-- VEHICLES TABLE: Global read access for authenticated users
-- -----------------------------------------------------------------------------
create policy "Authenticated users can read global vehicles"
on public.vehicles for select
to authenticated
using (true);

-- -----------------------------------------------------------------------------
-- TENANTS TABLE: Users can view and update their own shop
-- -----------------------------------------------------------------------------
create policy "Users can view their own tenant"
on public.tenants for select
using (id = public.current_tenant_id());

create policy "Admins can update their own tenant"
on public.tenants for update
using (id = public.current_tenant_id())
with check (id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- PROFILES TABLE: Users view profiles in their tenant
-- -----------------------------------------------------------------------------
create policy "Users view profiles within their tenant"
on public.profiles for select
using (tenant_id = public.current_tenant_id());

create policy "Users can update their own profile"
on public.profiles for update
using (id = auth.uid());

-- -----------------------------------------------------------------------------
-- INVENTORY ITEMS: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for inventory select"
on public.inventory_items for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory insert"
on public.inventory_items for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory update"
on public.inventory_items for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory delete"
on public.inventory_items for delete
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- ITEM VEHICLE COMPATIBILITY: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for compatibility select"
on public.item_vehicle_compatibility for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for compatibility insert"
on public.item_vehicle_compatibility for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for compatibility delete"
on public.item_vehicle_compatibility for delete
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- CUSTOMERS: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for customers select"
on public.customers for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers insert"
on public.customers for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers update"
on public.customers for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers delete"
on public.customers for delete
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- QUOTES & QUOTE ITEMS: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for quotes select"
on public.quotes for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quotes insert"
on public.quotes for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quotes update"
on public.quotes for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items select"
on public.quote_items for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items insert"
on public.quote_items for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items update"
on public.quote_items for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items delete"
on public.quote_items for delete
using (tenant_id = public.current_tenant_id());
```

---

### 3.3 Atomic Stock Deduction Stored Procedure
To prevent race conditions, negative inventory, or double deductions when an invoice is marked as paid:

```sql
create or replace function public.process_quote_payment(
  p_quote_id uuid,
  p_payment_method text,
  p_payment_notes text default null
)
returns void as $$
declare
  v_tenant_id uuid;
  v_already_deducted boolean;
  v_item record;
begin
  -- Validate tenant context
  v_tenant_id := public.current_tenant_id();

  -- Lock the quote row for update
  select inventory_deducted into v_already_deducted
  from public.quotes
  where id = p_quote_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Quote not found or unauthorized.';
  end if;

  if v_already_deducted then
    raise exception 'Inventory for this invoice has already been deducted.';
  end if;

  -- Loop through physical inventory items in the quote
  for v_item in
    select item_id, quantity
    from public.quote_items
    where quote_id = p_quote_id
      and item_id is not null
      and is_labor = false
  loop
    -- Deduct stock directly with atomic decrement
    update public.inventory_items
    set quantity_on_hand = quantity_on_hand - v_item.quantity,
        updated_at = now()
    where id = v_item.item_id and tenant_id = v_tenant_id;
  end loop;

  -- Mark invoice as paid and inventory as deducted
  update public.quotes
  set status = 'paid',
      payment_method = p_payment_method,
      payment_notes = p_payment_notes,
      paid_at = now(),
      inventory_deducted = true,
      updated_at = now()
  where id = p_quote_id and tenant_id = v_tenant_id;

end;
$$ language plpgsql security definer;
```

---

## 4. EXTERNAL APIS & DATA SOURCES: NHTSA vPIC ENGINE

### 4.1 NHTSA vPIC Overview
The US National Highway Traffic Safety Administration (NHTSA) provides a free, public REST API with zero API key requirement. We use it to populate our master `vehicles` database so users can effortlessly select Years, Makes, and Models without typing them manually.

### 4.2 Endpoint Specifications

#### 1. Fetch Passenger Car & Truck Makes
```http
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/truck?format=json
```
- **Response Format**:
  ```json
  {
    "Count": 128,
    "Message": "Response returned successfully",
    "Results": [
      { "MakeId": 440, "MakeName": "ASTON MARTIN", "VehicleTypeId": 2, "VehicleTypeName": "Passenger Car" },
      { "MakeId": 448, "MakeName": "TOYOTA", "VehicleTypeId": 2, "VehicleTypeName": "Passenger Car" }
    ]
  }
  ```

#### 2. Fetch Models for a Specific Make & Model Year
```http
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json
```
- **Example**: `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/Toyota/modelyear/2023?format=json`
- **Response Format**:
  ```json
  {
    "Count": 24,
    "Message": "Response returned successfully",
    "Results": [
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1861, "Model_Name": "Camry" },
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1863, "Model_Name": "Corolla" },
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1883, "Model_Name": "RAV4" },
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1888, "Model_Name": "Tacoma" }
    ]
  }
  ```

---

### 4.3 Ingestion Strategy & Seed Script (`scripts/seed-vehicles.ts`)
Rather than querying the NHTSA API in real-time during user quoting (which introduces network latency and third-party downtime risk), we pre-seed the top 20 automotive makes across model years 2015 to 2026 into the Supabase `vehicles` table.

```typescript
// scripts/seed-vehicles.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypass RLS for master vehicle data
);

const TARGET_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const TARGET_MAKES = [
  'Toyota', 'Ford', 'Chevrolet', 'Honda', 'Nissan', 'Jeep', 'Ram', 
  'Subaru', 'GMC', 'BMW', 'Mercedes-Benz', 'Audi', 'Tesla', 'Porsche', 
  'Lexus', 'Hyundai', 'Kia', 'Dodge', 'Cadillac', 'Volkswagen'
];

interface NhtsaModelResult {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedVehicles() {
  console.log('🚀 Starting NHTSA vPIC Seed Engine...');

  for (const year of TARGET_YEARS) {
    for (const make of TARGET_MAKES) {
      try {
        console.log(`Fetching: ${year} ${make}...`);
        const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        
        const data = await res.json();
        const models: NhtsaModelResult[] = data.Results || [];

        const rows = models.map((m) => ({
          year,
          make: m.Make_Name.toUpperCase().trim(),
          model: m.Model_Name.trim(),
        }));

        if (rows.length > 0) {
          const { error } = await supabase
            .from('vehicles')
            .upsert(rows, { onConflict: 'year,make,model,trim' });

          if (error) console.error(`DB Insert Error (${year} ${make}):`, error.message);
          else console.log(`✅ Saved ${rows.length} models for ${year} ${make}`);
        }

        // Polite delay to avoid API rate limiting
        await sleep(300);
      } catch (err: any) {
        console.error(`Failed ${year} ${make}:`, err.message);
      }
    }
  }
  console.log('🏁 NHTSA Vehicle seeding complete.');
}

seedVehicles();
```

---

## 5. GITHUB REPOSITORY STRUCTURE

```
carshop_pos/
├── .env.example
├── .gitignore
├── README.md
├── docs/
│   ├── PROJECT_SPEC.md                  <-- This specification manual
│   ├── FOUNDER_SETUP_GUIDE.md
│   └── supabase-mcp-setup.md
├── design/
│   └── figma-ui/                        <-- Figma UI export (reference only, not built)
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── scripts/
│   └── seed-vehicles.mts               <-- NHTSA vPIC ingestion script
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20261014193854_initial_schema.sql
│       ├── 20261014193915_rls_policies.sql
│       ├── 20261014193924_payment_procedure.sql
│       └── ...                         <-- one file per later change; names match the remote migration history
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                    <-- Marketing / Landing page
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   ├── register/page.tsx
    │   │   └── layout.tsx
    │   └── (dashboard)/
    │       ├── layout.tsx              <-- Multi-tenant shell with sidebar
    │       ├── dashboard/page.tsx      <-- Key stats, low stock alerts, pipeline
    │       ├── inventory/
    │       │   ├── page.tsx            <-- Inventory list, stock pills, filter
    │       │   ├── new/page.tsx        <-- Add part + YMM compatibility form
    │       │   └── [id]/edit/page.tsx
    │       ├── quotes/
    │       │   ├── page.tsx            <-- Quotes list & pipeline view
    │       │   ├── new/page.tsx        <-- Quoting Engine (Customer + YMM Magic Filter)
    │       │   └── [id]/
    │       │       ├── page.tsx        <-- Quote detail, WhatsApp dispatch, PDF button
    │       │       └── pdf/route.ts    <-- Server-side PDF render stream
    │       ├── customers/
    │       │   ├── page.tsx            <-- Customer Directory (WhatsApp, Type)
    │       │   ├── new/page.tsx
    │       │   └── [id]/page.tsx       <-- Customer purchase/quote history
    │       └── settings/
    │           └── page.tsx            <-- Shop Profile, Logo, Tax %, Terms
    ├── components/
    │   ├── ui/                         <-- shadcn/ui components (button, dialog, input, etc.)
    │   ├── dashboard/
    │   │   ├── stats-cards.tsx
    │   │   ├── low-stock-alert-card.tsx
    │   │   └── recent-quotes-table.tsx
    │   ├── inventory/
    │   │   ├── inventory-table.tsx
    │   │   ├── ymm-compatibility-selector.tsx
    │   │   └── stock-badge.tsx
    │   ├── quotes/
    │   │   ├── quote-wizard.tsx
    │   │   ├── magic-fit-filter.tsx    <-- YMM dynamic part selector
    │   │   ├── line-items-editor.tsx
    │   │   └── payment-modal.tsx       <-- Manual payment logger
    │   ├── pdf/
    │   │   ├── quote-pdf-document.tsx  <-- @react-pdf/renderer template
    │   │   └── quote-pdf-download-btn.tsx
    │   └── shared/
    │       ├── app-sidebar.tsx
    │       ├── top-navbar.tsx
    │       └── whatsapp-share-button.tsx
    └── lib/
        ├── supabase/
        │   ├── client.ts               <-- Browser client
        │   ├── server.ts               <-- Server Component client (cookies)
        │   └── middleware.ts           <-- Auth redirect & tenant session guard
        ├── types/
        │   └── database.types.ts       <-- Generated Supabase TypeScript types
        ├── utils/
        │   ├── currency.ts             <-- Format amounts with shop currency
        │   ├── whatsapp.ts             <-- URL deep-link & message composer
        │   └── ymm-filter.ts           <-- Fitment calculation helper
        └── validations/
            ├── inventory.schema.ts
            ├── quote.schema.ts
            └── customer.schema.ts
```

## 6. MASTER UI/UX GENERATION PROMPT (FOR FIGMA / AI UI TEMPLATES)

> 🟢 **STATUS**: **ALREADY GENERATED & AVAILABLE IN CODE**  
> The prompt below was executed in Figma, and the resulting complete React + Tailwind UI template is stored in `./design/figma-ui/`.  
> - Primary Component: `design/figma-ui/src/App.tsx`  
> - Styles & Tokens: `design/figma-ui/src/index.css`  
> AI Agents should inspect and adapt this existing code directly into the Next.js project.

The original prompt used to generate the UI:

---

```text
Design a complete, high-fidelity B2B SaaS web application UI template in Figma for "Apex Auto Accessories POS & Quoting Engine" — a modern Point of Sale, Inventory Management, and Quoting platform designed specifically for automotive accessory sellers, retailers, and aftermarket styling parts distributors (selling window tint rolls, vinyl wraps, PPF film, 12V audio electronics, lighting, and exterior accessories, with support for optional installation/fitting services).

### 1. DESIGN SYSTEM & VISUAL TOKENS (Desktop 1440px Canvas)
- **Aesthetic**: Sleek, precision-engineered automotive software. Dark-slate structural accents with a clean, high-contrast light workspace.
- **Color Palette**:
  - Primary / Surfaces: Clean slate background (`#F8FAFC`), crisp white elevated cards (`#FFFFFF`), borders (`#E2E8F0` / `#CBD5E1`).
  - Dark Structural Elements: Deep automotive slate (`#0F172A`, `#1E293B`) for sidebar and primary action buttons.
  - Accent & Brand: Electric Cobalt Blue (`#2563EB`) for primary focus and vehicle fitment badges.
  - WhatsApp & Paid Status: Vibrant Emerald Green (`#10B981`) for the "Share to WhatsApp" action and "Paid" invoice pills.
  - Alerts: Rose Red (`#F43F5E`) for low-stock threshold warning pills and restock alerts; Amber (`#F59E0B`) for pending quotes.
- **Typography**: Inter or Plus Jakarta Sans. Clean visual hierarchy: Page Titles (24px Bold), Section Headers (16px Semi-Bold), Body Text (14px Regular), Data Table & Labels (12–13px Medium), Monospace font for SKUs and VIN/Part codes.
- **Component Kit**: Modern rounded corners (8px–10px radius), subtle drop shadows (`shadow-sm`, `shadow-md`), clean badge pills, and Lucide automotive/commerce icons.

---

### 2. SCREEN 1: MAIN B2B STORE DASHBOARD (Store Overview & POS Hub)
- **Top Navigation Bar**:
  - Left: Shop switcher with custom logo ("Apex Auto Accessories - Downtown Store").
  - Center: Global search bar with shortcut key badge (`⌘K Search inventory, quotes, or customers...`).
  - Right: Quick notification bell with a rose badge ("4 Low Stock Alerts") and User Profile avatar dropdown ("Admin - Marcus Vance").
- **Key Performance Metrics (4 KPI Cards)**:
  - "Gross Revenue (This Month)": $48,250 (+14.2% vs last month).
  - "Active Quotes Pipeline": 16 quotes ($21,400 pending value).
  - "Low Stock Alerts": 4 items below threshold (rose red warning pill).
  - "Orders / Quotes Fulfilled": 42 orders completed this month.
- **Quick Action Bar**:
  - High-contrast primary button: `+ Create New Quote` (with car icon).
  - Secondary button: `+ Add Inventory Item`.
  - Secondary button: `+ Register Customer`.
- **Split Workspace Layout**:
  - **Left Section (65% width) - Recent Quotes & Invoices Pipeline**:
    - Data table columns: Quote # (e.g., `Q-1048`), Customer (e.g., "Metro Porsche Dealership"), Vehicle ("2024 Porsche 911 GT3"), Total Amount ($1,850.00), Status Pill (`Draft` = grey, `Sent` = blue, `Invoiced` = amber, `Paid` = emerald green), and Action icons (View, PDF Download, WhatsApp Share).
  - **Right Section (35% width) - Urgent Stock Restock Alerts Card**:
    - High-density card listing products where on-hand quantity $\le$ low-stock threshold.
    - Each row shows: SKU (`WF-CER-2040`), Product Name ("Suntek Carbon 20% 40in Roll"), Category tag ("Window Film"), a prominent warning pill ("2 rolls left (Min: 5)"), and a quick "Adjust Stock" button.

---

### 3. SCREEN 2: THE QUOTING ENGINE & YMM MAGIC FITMENT WIZARD (The Core Engine)
- **Quote Header Toolbar**:
  - Left: Back link, Quote title "Quote #Q-1042", Status Badge ("Draft").
  - Right Action Buttons: "Save Draft" (secondary outline), "Download PDF" (outline with file icon), "Share to WhatsApp" (emerald green with WhatsApp icon), and "Mark as Paid" (prominent dark primary button).
- **Top Card: Customer & Vehicle Cascading Selector**:
  - Customer Combobox: Searchable client selector with account badge ("Downtown Ford Fleet", "Dealership Account") and phone number.
  - Cascading 3-Step Vehicle Selector: Three linked dropdowns: `[Year: 2024]` $\rightarrow$ `[Make: Ford]` $\rightarrow$ `[Model: F-150 Lightning]`.
  - Live Fitment Indicator: A prominent electric-blue banner: `Vehicle Selected: 2024 Ford F-150 Lightning (Fits 14 catalog accessories)`.
- **Two-Column Interactive Quoting Workspace**:
  - **Left Column (60% width) - Magic Fit Accessory Selector & Line Items**:
    - *Accessory Picker*: Search input with toggle switch `"Show Only Compatible Parts"` (enabled by default). Table lists: SKU, Item Name, Category badge (e.g., 'Window Film', 'Audio Upgrade'), Retail Price, Stock Status ("12 in stock"), a subtle "Universal Fit" badge for universal rolls/accessories, and an `+ Add to Quote` button.
    - *Quote Line Items Table*: Reorderable list of chosen items with quantity stepper, unit price, line total, and remove button.
    - *Optional Fitting / Labor Services*: A dedicated button `+ Add Optional Fitting / Labor Service` allowing stores that provide installation to add custom labor fees (e.g., "Front Window Tint Installation - 1.5 Hours", "Speaker Fitting Fee"). For parts-only sellers, this section remains empty.
  - **Right Column (40% width) - Sticky Order Summary & Payment Drawer**:
    - Subtotal calculation: $630.00.
    - Discount field: Input box with % or $ toggle (-$30.00).
    - Shop Tax Rate (8.25%): $49.50.
    - Grand Total: $649.50 (bold, 28px text).
    - Payment Method Selector: Dropdown (`Cash`, `Card Terminal`, `Bank Transfer`, `Check`).
    - Internal Notes & Quote Disclaimer preview.

---

### 4. SCREEN 3: INVENTORY MANAGEMENT & VEHICLE FITMENT CATALOG
- **Top Filter Bar**:
  - Search input: Filter by SKU, Part Name, or Category.
  - Category Pills: `[All Items]` `[Window Film]` `[Vinyl Wrap]` `[PPF]` `[Car Audio]` `[Accessories]` `[Chemicals / Hardware]`.
  - Fitment Filter Dropdown: `[All Items]` `[Universal Fit Only]` `[Vehicle-Specific Only]`.
  - Action buttons: `+ Add New Part` and `Export CSV`.
- **Product Inventory Data Table**:
  - Columns:
    - SKU (Monospace font, e.g., `WF-IR-7040`).
    - Product Name & Category badge.
    - Fitment Type: Either an emerald badge `Universal Fit` OR a blue badge `Vehicle Specific (8 Models)` with a hover popover listing compatible vehicles.
    - Cost Price (e.g., $140.00).
    - Selling Price (e.g., $280.00).
    - Margin %: Auto-calculated pill (`50.0% Margin`).
    - On-Hand Quantity: High-contrast pill (Green if above threshold, Amber/Red with warning triangle if $\le$ low-stock threshold).
    - Actions Menu: Edit Part, Adjust Stock, Manage Vehicle Fitment, Delete.
- **Overlay Modal: "Add / Edit Inventory Part"**:
  - Inputs for SKU, Product Name, Category dropdown, Cost Price, Selling Price, Starting Stock, and Low Stock Alert Level.
  - Compatibility Mode selector:
    - Radio Card A: `Universal Fit` (Applies to all vehicles, film rolls, generic cleaners).
    - Radio Card B: `Vehicle Specific` (Reveals a multi-select combobox to link to Year/Make/Model vehicle records).

---

### 5. SCREEN 4: B2B CUSTOMER DIRECTORY & WHATSAPP CRM
- **Customer Directory Table**:
  - Columns: Customer / Company Name, Account Type badge (`Dealership`, `Fleet Account`, `Retail Customer`), Primary Contact Person, WhatsApp Phone (with direct green WhatsApp link icon), Email, Total Quotes/Invoices, and Outstanding Balance.
- **Slide-Over Customer Profile Drawer**:
  - Complete client details, billing address, tax/VAT number.
  - Direct Action button: `Message on WhatsApp` (opens pre-filled chat).
  - Purchase & Quote History: Chronological list of all quotes created for this customer, vehicle details, payment status, and quick link to view/print PDF.
```

---

## 7. COMPLETED PHASES (1–21): WHAT WAS BUILT

> **CURRENT STATUS (2026-10-19)**: All phases (1–15) are built and committed: this is **Version 1** (git tag `v1.0.0`). This section records exactly what each phase built, including later changes made within the phase (e.g. the `docs/changes.md` rounds after Phase 5). It describes the app as it exists today; where it differs from the blueprint in §1–6, this section and `supabase/migrations/` are authoritative. **Do not rebuild or refactor these phases.** Active work is in §8.

---

### PHASE 1: Project Foundation, Supabase Setup & Multi-Tenant RLS [COMPLETED]
**Commits**: `52884bb` "Phase 1", `c1eeee0` (hydration + dashboard prerender fixes).

**What was built**:
1. **Database (applied through the Supabase MCP, no manual SQL)**: tables `tenants`, `profiles`, `vehicles`, `inventory_items`, `customers`, `quotes`, `quote_items`, `item_vehicle_compatibility`, all with RLS. Migrations live in `supabase/migrations/`, named after the versions Supabase recorded; `npm run db:push` and `npm run db:types` (`scripts/db.mjs`) push migrations and regenerate `src/lib/types/database.types.ts`.
2. **Tenant isolation**: every policy checks `tenant_id = private.current_tenant_id()` (moved to schema `private` in Phase 6; the public wrapper is SECURITY INVOKER).
3. **Sign-up**: trigger `handle_new_shop_registration` creates the tenant and the owner's `admin` profile (later phases also add the walk-in customer and default categories). Pages `src/app/(auth)/register` and `login`.
4. **App foundation**: Next.js **16.4** App Router with `src/proxy.ts` (replaces `middleware.ts`) and Cache Components (session reads inside `<Suspense>`; `src/lib/supabase/server.ts` awaits `connection()` before reading cookies). Supabase clients in `src/lib/supabase/`. `getShopSession()` in `src/lib/auth.ts` returns the tenant, role (anything but `admin` is staff), name and email.
5. **Design system**: tokens and layout ported from `design/figma-ui/` into `src/app/globals.css` (mostly plain CSS classes) and `src/app/(dashboard)/layout.tsx` (sidebar + top bar). shadcn/ui is configured; its components import `cn` from `@/lib/utils`.
6. **Storage**: bucket `shop-assets` for shop logos (`shop-assets/<tenant>/`).

**No longer present**: `process_quote_payment` (§3.3) was dropped in the Phase 5 changes; payments use `invoice_payments` + `record_payment`.

**Open item**: Supabase Auth leaked-password protection is off (a dashboard toggle for the developer).

---

### PHASE 2: NHTSA vPIC Vehicle Engine & Seed Pipeline [COMPLETED]
**Commit**: `0b1e014` "Phase 2" (catalog extended in Phase 7).

**What was built**:
1. `src/lib/types/vehicle.ts`: NHTSA response and vehicle row types.
2. `scripts/seed-vehicles.mts` (`npm run seed:vehicles`, Node's built-in TypeScript, no ts-node/dotenv): 20 makes, cars/trucks/MPVs only, exact `Make_Name` matches (vPIC matches substrings), rate-limited with retries; `--from=YYYY --to=YYYY` (added in Phase 7, default 1981–2026).
3. Unique key `uq_vehicle_ymm` made NULLS NOT DISTINCT so re-runs skip existing rows (since Phase 7: `(year, make, model, trim, tenant_id)`).
4. `/api/vehicles` (signed-in only): Year → Make → Model through RPCs `vehicle_years`, `vehicle_makes`, `vehicle_models` (SECURITY INVOKER). Responses are `no-store` (since Phase 7). Client hook `src/lib/hooks/use-vehicle-cascade.ts`.

---

### PHASE 3: Inventory Engine (Universal Fit & YMM Compatibility) [COMPLETED]
**Commit**: `9693ac7` "Phase 3" (extended in Phases 4, 5 and 7).

**What was built**:
1. `src/lib/validations/inventory.schema.ts` and `src/lib/actions/inventory.ts` (list, create, update, delete).
2. RPC `save_inventory_item`: item + vehicle links saved in one transaction; SKUs in capitals, unique per shop; vehicle-specific items need at least one vehicle. (Phase 7: takes `p_category_id`.)
3. RPC `search_inventory_items`: SKU, name and linked vehicles (Phase 7: also category names), symbols matched literally.
4. `/inventory` page: `inventory-table.tsx` (name, SKU, category, fitment, cost, selling price, colour-coded margin, stock; rows at or below their own `low_stock_threshold`, default 5, highlighted), `inventory-item-dialog.tsx` (add/edit, Generate SKU, live margin, Universal Fit / Vehicle Specific), `ymm-compatibility-selector.tsx` (Year → Make → Model chips; changing the year keeps the make), delete with confirmation.
5. Filters in the URL. Any shop member can manage inventory. No pagination (Phase 9).

---

### PHASE 4: B2B Customer Directory, Pakistan Localization & Settings [COMPLETED]
**Commits**: `0537081` "Phase 4", `135f72b` "Phase 4 Tweaks".

**What was built**:
1. **Localization (§2.3)**: currency `Rs.`/`PKR` with optional paisa (`formatMoney(amount, tenant.money)` in `src/lib/format.ts`); phones parsed, stored E.164 and shown `0300-1234567` (`src/lib/phone.ts`, also builds `wa.me` links); WhatsApp must be a mobile; international numbers only when `allow_international_phones` is on.
2. **Tax-inclusive prices**: shop default `prices_include_tax` and per-item `price_includes_tax`.
3. **Settings** (`/settings`, admins edit, staff view): currency, paisa (live preview), tax rate, prices include tax, international numbers, editable timezone (IANA, grouped by region), dashboard clock (show/hide, digital/analog, 12/24-hour). Phase 5 added quotation validity days and week start; Phase 6 shop details + logo; Phase 7 product categories.
4. **Customers** (`src/lib/actions/customers.ts`, `/customers` with `customer-dialog.tsx`, profile `/customers/[id]` with WhatsApp button and document history): type badges (Dealership / Fleet / Retail), search by name, contact, phone, email, tax ID; delete blocked once a customer has documents.
5. Later additions (Phase 5 changes): CNIC/NTN (`cnic_or_ntn`), sales-tax registration + STRN (database-enforced for dealerships/fleet and registered customers), default discount %, credit period (`credit_days`), and one hidden, non-editable "Walk-in / Cash Customer" per shop (`customers.is_walk_in`).

---

### PHASE 5: Drafts, Quotations, Invoices, Payments & Dashboard [COMPLETED]
**Commits**: `cd9a9e4` (Phase 5), `fa2949f` (`docs/changes.md` rounds 1–5), `80434e2` (branding).

**What was built**:
1. **One document, three stages**: a `quotes` row moves draft → quotation (`sent` / `accepted` / `cancelled`) → invoice (`invoiced` / `paid`; cancelled invoice = `void`). Sidebar sections `/drafts`, `/quotations`, `/invoices`. Columns `draft_number`, `quotation_number`, `invoice_number` (unique per shop); `quote_number` is GENERATED (the current one). A quotation moved back to drafts keeps its Q- number for re-issue.
2. **Numbering**: RPC `next_document_number('D'|'Q'|'INV')` returns prefix + (highest used + 1, from 1001), under an advisory lock; new documents preview their next number without reserving it.
3. **RPCs**: `save_quote` (13 args: lines with per-unit discounts, document discount + required reason, walk-in name/phone, due date), `convert_quote` (to draft / quotation / invoice), `record_payment`, `dashboard_metrics`. Totals computed in SQL, mirrored in `src/lib/quote-math.ts`: line nets → subtotal → document discount → taxable → tax (inclusive lines have tax backed out, exclusive lines get it added).
4. **Builder** (`src/components/quotes/quote-builder.tsx`, `line-items.tsx`, `line-search.tsx`, `customer-picker.tsx`): SOS-style layout (bill-to left, number/dates/status right, full-width lines, notes and totals at the bottom); customer search with inline registration; Walk-in / Cash button with optional buyer name and phone; customer default discount applied as the document discount; lines from a search box (`/api/quote-items?q`) or custom items (`item_id` null, no stock); inventory unit price fixed server-side; per-unit discount in % or Rs., `sale_price`, line total = qty × sale price; quantity steppers, move up/down, remove; Save & Close / Save as Copy; unsaved-changes guard (`src/lib/hooks/use-leave-guard.ts`); toasts via `src/lib/notify.ts`. **No vehicle picker and no Magic Fit filter on documents** (removed in changes.md round 2 at the product owner's request).
5. **Stock**: drafts hold nothing; quotations reserve, invoices deduct **at invoicing, not payment** (trigger `quote_items_sync_stock`, SECURITY DEFINER, refuses more than on hand − reserved; `quotes_sync_stage_stock` on status changes). `inventory_items.reserved_quantity` is trigger-only. Quotation validity days (Settings, default 2); expired quotations keep their stock until acted on.
6. **Payments**: `invoice_payments` (amount, method, date, reference) and `invoice_payment_items` (pay specific lines; share = line total / Σ line totals × invoice total, `src/lib/payments.ts`); trigger keeps `quotes.amount_paid`; `quotes_derive_payment_status` makes invoiced ↔ paid automatic (paid can't be set directly); `quote_items_relink_payments` re-links allocations after lines are replaced. `payment-dialog.tsx`; Mark Unpaid removes payments; delete only with nothing paid.
7. **Invoice statuses** shown as Pending / Due / Partially Paid / Paid / Cancelled (`statusKey()` in `src/lib/documents.ts`, shop-local dates). Due date = invoice date + customer credit days, editable per invoice.
8. **Dashboard** (`/dashboard`): one date range from the URL (`?range=today|week|month|year|all|custom&from&to`, `date-range-picker.tsx`, `tenants.week_start`); widgets for sales, profit, tax, pending invoices/quotations, aging, counts, each as Numbers / Bar / Pie per user (`profiles.dashboard_prefs`); hand-rolled SVG charts in `src/components/dashboard/charts.tsx`.
9. **Vendors**: optional `vendor_name` per item, shown in the item details.
10. **Branding** (`80434e2`): product name "CarShop.Pk POS System", logos in `public/brand/`, favicons, collapsible sidebar (`html[data-sidebar=collapsed]`), red accent `#D9161F`.

---

### PHASE 6: PDFs, Sharing, Search, Notifications, Reports & Phone Layout [COMPLETED]
**Commit**: `b2d4fc5` "Phase 6".

**What was built**:
1. **PDFs** with `@react-pdf/renderer`: `src/components/pdf/document-pdf.tsx`, data loader `src/lib/printable.ts`. A4 with logo, shop details (address, phone, NTN, STRN), customer, lines with discounts, totals; invoices add payments, balance and a status stamp; "Terms & notes" (`tenants.quote_footer_notes`) at the bottom.
2. **Routes**: `/api/documents/[id]/pdf` (signed in); public `/share/[token]` and `/share/[token]/pdf` (service-role read by `quotes.share_token`; drafts can't be shared).
3. **Share menu** (`src/components/quotes/share-menu.tsx`): View PDF, Download PDF, Share on WhatsApp (pre-filled message + private link), Copy customer link. Links use `NEXT_PUBLIC_APP_URL` (still `http://localhost:3000` until deployed).
4. **Shop details** in Settings (name, phone, email, address, NTN, STRN, terms) and logo upload `POST /api/shop/logo`.
5. **Global search** (Ctrl K, `src/components/shared/global-search.tsx`, `/api/search`): documents by number or customer, customers, parts by name or SKU.
6. **Notification bell** (RPC `shop_alerts()`): overdue invoices, invoices due within 3 days, low stock, quotations expiring soon, expired quotations still holding stock.
7. **Reports** (`/reports`, RPC `report_data(range)`): sales, profit, payments collected, money owed, sales chart, top products/customers, payments by method, aging, stock value + low stock; CSV export per table (`src/components/reports/csv-button.tsx`).
8. **Phone layout**: ☰ slide-out drawer ≤ 768px (`src/components/shared/mobile-nav.tsx`, `html[data-mobile-nav=open]`, closes on backdrop tap, Escape and navigation, shows the full menu whatever the desktop collapse state), 60px top bar with search as an icon, stacked pages, full-width dialogs, wide tables scrolling inside their cards, no sideways page scroll.
9. **Security**: `rls_auto_enable()` execute revoked; `current_tenant_id()` moved to schema `private`. Dashboard "Coming next" card replaced with Quick actions.

---

### PHASE 7: Product Categories, 1960–2026 Vehicles & Pakistan-Market Catalog [COMPLETED]
**Commit**: `acc8dc9` "Phase 7".

**What was built**:
1. **Product categories** (`20261016120000_product_categories.sql`):
   - Table `public.categories` (`tenant_id`, `parent_id`, `name`, `sort_order`): a per-shop tree, at most 4 levels (trigger `private.categories_check_depth`); names unique per parent (case-insensitive). RLS: members read their shop's categories, only admins change them; a category with items or subcategories can't be deleted (`on delete restrict`).
   - Default list from `docs/categories.md` (14 main, 157 total) via `private.seed_default_categories()` and trigger `tenants_seed_categories` for new shops.
   - `inventory_items.category` (text) replaced by `category_id`; existing items mapped (Window Film → Exterior › Wrapping › Tinting Film, Vinyl Wrap → … › Vinyl Wraps, PPF → … › PPF, Car Audio → Audio, Accessories → Others, Hardware / Chemicals → Cleaning & Detailing). `save_inventory_item` takes `p_category_id`; `search_inventory_items` matches category and ancestor names.
   - Code: `src/lib/categories.ts` (tree index, paths, icons, SKU prefixes per main category), `src/lib/category-data.ts`, `src/lib/actions/categories.ts` (admin-only), Settings → Product categories (`src/components/settings/category-manager.tsx`: search, expand, add, rename, delete), searchable picker `src/components/inventory/category-picker.tsx` in the part dialog (Generate SKU uses the main category prefix, e.g. EXT-).
   - Inventory filters: category (includes everything below, with counts), Stock (`in`/`low`/`out`), Sort (`name`, `newest`, `stock`, `price-high`, `price-low`). Stock and Sort run in the server action after the query, not in SQL.
2. **Vehicle years 1960–2026**: `vehicles.year` check 1960–2035 (`20261016173614_vehicle_years_from_1960.sql`); 1981–2014 seeded from NHTSA; for US-only makes, 1960–1980 are copies of each make's 1981 models (`20261016190000_vehicles_1960_1980_from_1981.sql`, an approximation the developer chose); for makes in the Pakistan list those copies were removed (`20261016200000_drop_copied_pre1981_for_pk_makes.sql`).
3. **Shop vehicles** (`20261016180000_shop_vehicles.sql`): no separate table. `vehicles.tenant_id` is `null` for the shared catalog and set for a shop's own vehicles (RLS: catalog + own shop). RPC `add_vehicle(p_year, p_make, p_model)` returns an existing match (catalog first, case-insensitive) or inserts a shop vehicle; trigger `private.check_fitment_vehicle` blocks linking another shop's vehicle. UI: "Vehicle not listed? Add it" under the vehicle pickers in the **part dialog only** (`src/lib/actions/vehicles.ts`).
4. **Pakistan-market catalog**: `scripts/data/vehicles-pk.json` (32 makes, ~600 models, production years per model from PakWheels make pages + model knowledge; a few years approximate), loaded by `scripts/seed-pk-vehicles.mts` (`npm run seed:vehicles:pk`, skips existing year/make/model case-insensitively): 8,514 vehicle-years added, 23,273 catalog rows. Short makes shown in capitals (BYD, MG, FAW, DFSK, GWM, BAIC, ORA) by `formatMake`.

---

### PHASE 8: Responsive Foundations, Breakpoint Tokens & iOS Zoom Fix [COMPLETED]
**Commit**: `60e619a` "Phase 8 - responsive breakpoint tokens, drawer polish and ios zoom fix".

**What was built**:
1. **Viewport** (`src/app/layout.tsx`): `viewport` export with `width: device-width`, `initialScale: 1`, `maximumScale: 5`, `viewportFit: "cover"`, `interactiveWidget: "resizes-content"`, `themeColor: "#111113"`.
2. **Breakpoint tokens** in `:root` (`src/app/globals.css`): `--bp-xs` 480, `--bp-sm` 640, `--bp-md` 768 (phones: drawer, stacked pages), `--bp-lg` 1024 (tablets: icon-rail sidebar), `--bp-xl` 1280, `--bp-2xl` 1536, `--container-max-width` 1720px. Every `@media` now uses one of these widths: 520→480, 560→640, 760→768, 860/920/1080/1100→1024, 1180→1280. Visible effect: the icon-rail sidebar starts below 1024px (was 920px); auth pages, document header/footer, reports and customer profile stack below 1024px.
3. **No sideways scroll on small laptops**: `.main-shell`'s 900px minimum width is dropped at ≤ 1280px (242px sidebar + 900px scrolled sideways between 1025 and 1141px). Verified at 1440, 1280, 1100, 1030, 1000, 800 and 393px on dashboard, documents, reports, inventory, customers and settings.
4. **Safe areas**: `--safe-top/bottom/left/right` (`env(safe-area-inset-*)`) applied to the phone top bar, the drawer and page padding.
5. **iOS auto-zoom fix**: at ≤ 768px every input (except checkbox/radio/range), select and textarea is `font-size: 16px !important`.
6. **Drawer** (extends Phase 6, `src/components/shared/mobile-nav.tsx`): `translate3d` slide with `will-change: transform` and an eased transition; swipe left to close (the drawer follows the finger via `--drawer-drag` / `html[data-mobile-nav-dragging]`; closes past 70px or on a quick flick; vertical moves are left to scrolling); the drawer's shadow only shows while open (it used to show along the page's left edge).
7. **Phone top bar** 56px (+ top safe area), was 60px.

---

### PHASE 9: Server-Side Pagination & Mobile Table Cards [COMPLETED]
**Commit**: `5eee764` "Phase 9 - server-side pagination and mobile table cards".

**What was built**:
1. **Migration** `20261017100000_phase9_pagination.sql`:
   - `inventory_items.available_quantity` (= on hand − reserved) and `is_low_stock` (available ≤ `low_stock_threshold`) as stored generated columns, so the Stock filter and "lowest stock" sort run in SQL; index `(tenant_id, name)`.
   - RPC `customer_directory_stats()`: total customers, B2B accounts, outstanding balance for the whole directory (walk-in excluded).
   - RPC `filter_documents(p_statuses, p_status_key, p_search, p_today)` (setof `quotes`, SECURITY INVOKER): section statuses, displayed status (pending / due / partial worked out from payments and the due date against the shop's local date; anything else = stored status) and word search over all numbers, customer name and walk-in name. RPC `document_list_totals(...)` sums total (excluding cancelled) and balance for the same filters.
2. **Shared helpers** `src/lib/pagination.ts`: `parsePagination` (`?page=`, `?limit=` 25/50/100, invalid → page 1 / 25), `pageRange`, `Paged<T>`, `isRangePastEnd` (PostgREST PGRST103), `pastEndRedirect` (a page past the end redirects to the last page).
3. **Paged actions** (exact counts, stable `id` tiebreak): `getInventoryItems(filters, pagination)` → rows + total + `lowStock` (low-stock count across all matches); `getCustomers(filters, pagination)` + `getCustomerStats()`; `getDocuments(section, filters, pagination)` → rows + total + footer sums. All filtering and sorting moved from JavaScript into SQL.
4. **Pagination bar** `src/components/ui/pagination-bar.tsx`: "Showing 1–25 of 60 products", First / Previous / page numbers with gaps / Next / Last, rows per page (keeps the first visible row in view when the size changes); URL-synced, filters kept. Every filter bar (inventory, customers, documents) drops `page` on change.
5. **Phone cards ≤ 768px** (`.mobile-cards`; the table gets `.desktop-table` and is hidden): inventory (SKU, price, name, category pill, available/reserved pill; tap → details, 44px edit/delete), customers (name, type badge, document count, balance or Settled, one-tap WhatsApp), documents (number, status badge, customer, date/due date, total, balance). Footer totals and the pagination bar sit under the cards.
6. Summary figures now describe everything matching the filters, not just the loaded page: inventory "N products" / "N low stock", customer tiles (whole directory), document footer totals.

---

### PHASE 10: Mobile Document Builder & Sticky Cashier Bar [COMPLETED]
**Commit**: `9f67719` (`Phase 10 - mobile document builder and sticky cashier bar`).

**What was built** (extends the Phase 5 builder; everything below applies at ≤ 768px, desktop is unchanged):
1. **Sheet component** `src/components/quotes/mobile-sheet.tsx` (Radix Dialog): `variant="full"` covers the screen, `variant="bottom"` rises from the bottom edge (16px top corners, drag handle, `max-height: 90dvh`); slide-up animation, safe-area padding, 44px close button, optional pinned footer, `initialFocus` ref. CSS `.sheet*` in `globals.css`. Phase 11's bottom-sheets can reuse it.
2. **Full-screen part search** (`line-search.tsx`): on phones the inline box is replaced by a "Search parts to add…" button + "Custom"; the sheet auto-focuses its field, shows **category chips** (All + the shop's main categories, passed from `document-pages.tsx` via `buildCategoryIndex(...).roots`), and each tap adds a part (again = +1) while the sheet stays open ("Done · N added"). `GET /api/quote-items?category=<uuid>` filters to that category and everything below it (`descendantIds`). Fetching shared through `usePartSearch`.
3. **Full-screen customer search** (`customer-picker.tsx`): "Choose a customer…" button + Walk-in / Cash; the sheet lists Walk-in first, search results, and "Register a new customer". "Change customer" (✕) opens the sheet on phones. Fetching shared through `useCustomerSearch`.
4. **Line cards** (`line-items.tsx`, `.mobile-lines` / `.mobile-line-card`; the table is hidden): description, SKU or "Custom item", unit price and discount (e.g. `−10%`), line total, stock warnings; 44px `+/−` (`.touch-stepper`, same `stepQuantity` logic as the desktop stepper) and 44px delete. Tapping a card opens a **bottom edit sheet**: description (custom), quantity, unit price (custom only), discount % / Rs., sale price, line total, Remove / Done; edits apply as typed.
5. **Delete with Undo** (desktop rows and phone cards): the line goes at once and a toast offers **Undo** for 6s, which puts it back in its old position (`notify.undo` in `src/lib/notify.ts`). `LineItems.onChange` is now a state setter (functional updates).
6. **Header accordion** (`quote-builder.tsx`, `.doc-header[data-open]`, `.doc-header-toggle`): a summary row (customer or "Choose a customer", number · due date, status badge, chevron) folds the customer panel and the details table. Open on new documents without a customer; folds after picking a (non walk-in) customer and on saved documents.
7. **Cashier bar** `src/components/quotes/mobile-action-bar.tsx`: `position: sticky; bottom: 0; z-index: 40`, full width (cancels the page padding), safe-area inset, translucent blurred background. Shows "Total · N lines" (or "Balance due" on a part-paid, unchanged invoice) and the stage's main action: Save when there are unsaved edits, otherwise the toolbar's primary action (Save Draft / Create Invoice / Convert to Invoice / Record Payment…); none on paid invoices.

---

### PHASE 11: Bottom-Sheets, Quick Cash & 80mm Thermal Receipts [COMPLETED]
**Commit**: `3e26ac0` (`Phase 11 - bottom-sheets, quick cash and 80mm thermal receipts`).

**What was built**:
1. **Form dialogs as bottom sheets** `src/components/shared/modal-sheet.tsx` (`ModalSheet`: portal + overlay + content inside a `Dialog.Root`), used by the part (`inventory-item-dialog.tsx`), customer (`customer-dialog.tsx`) and payment (`payment-dialog.tsx`) dialogs. Desktop: the same centred `.modal`. ≤ 768px (`.modal-sheet`): pinned to the bottom edge, full width, 16px top corners, drag handle (`.modal-handle`, reuses Phase 10 `.sheet-handle`), `max-height: 90dvh`, slide-up, the body scrolls and the footer (48px buttons) stays visible. **Keyboard**: `src/lib/hooks/use-keyboard-inset.ts` sets `--keyboard-inset` on `<html>` from `visualViewport` while a sheet is open; the sheet's `margin-bottom` lifts it (and its buttons) above the iOS keyboard (Android already resizes via `interactiveWidget`).
2. **Dashboard date range on phones** (`date-range-picker.tsx`): `useMediaQuery(PHONE_QUERY)` (`src/lib/hooks/use-media-query.ts`) swaps the two-month popover for a Phase 10 `MobileSheet` (`variant="bottom"`): quick ranges as chips (apply at once), one full-width month with 44px days and 44px month arrows, the picked range, Cancel / Apply. Desktop unchanged.
3. **80mm POS slip**, black only: shop name / address / phone / NTN·STRN, title, number, dates, status, customer + phone, items (name, `qty × sale price`, per-unit discount, line total), subtotal / discount / tax / TOTAL, invoices: paid-by methods, paid, balance due; a vector **QR code** to the customer share link (`src/lib/qr.ts` → `qrPath`, `qrcode` package; `customerLink` in `src/lib/customer-link.ts` gives none for drafts / cancelled), terms, "Thank you". Two renderers of the same `PrintableDocument`:
   - **Printed from the screen** (no new tab): `usePosSlipPrint()` in `src/components/quotes/pos-slip.tsx` fetches `GET /api/documents/[id]/printable` (JSON `{ doc, shareUrl }`, signed-in, RLS), portals the slip into `<body>` (`.pos-print-root`, off-screen), measures it, injects `@page { size: 80mm <height>mm; margin: 0 }`, sets `html.pos-printing` (print CSS hides everything else) and calls `window.print()`; `afterprint` removes it all. Works on phones too (system print / AirPrint / Sunmi print service).
   - **PDF** `src/components/pdf/thermal-receipt.tsx` (react-pdf, 226.77pt wide, auto height needs `<Page wrap={false}>`): `GET /api/documents/[id]/receipt` (`?download=1` saves it; `receiptResponse` in `src/lib/pdf.tsx`).
   - **Shop setting "Print format"** (Settings → Quotations & invoices; `tenants.print_format` 'a4' | 'pos', migration `20261019120000_tenant_print_format.sql`, admin-only like the other settings) decides the format everywhere on the document screen: one toolbar print button next to Share (`usePrintDocument`, `src/components/quotes/print-document.tsx`) reads **Print PDF** (A4) or **Print POS Slip** (80mm), and the Share menu offers **View / Download PDF** or **View / Download POS Slip** (`/api/documents/[id]/pdf` or `/receipt`, `?download=1` saves). Print PDF loads the A4 PDF into a hidden off-screen iframe (inline styles) and calls its `print()`, so the dialog opens on the same page; on phones or browsers without a built-in PDF viewer (`navigator.pdfViewerEnabled` false) it opens the PDF in the device's viewer instead. Applies to drafts, quotations and invoices; WhatsApp / Copy customer link stay in both, and the customer link (`/share/[token]`) always shows the A4 version.
4. **Quick cash & change** (`payment-dialog.tsx`, method Cash only): CASH RECEIVED field plus `+Rs. 500`, `+Rs. 1,000`, `+Rs. 5,000` (add up) and `Exact Amount`. Cash above the amount being paid is change ("Received: Rs. 20,000 → Change Due: Rs. 4,000"); cash below it becomes the payment ("Rs. 14,500 left on the invoice"); Clear restores the amount. Only the payment is recorded; the success toast adds "Give Rs. X change." Typing the amount, changing items or the method clears the cash.
5. **Touch targets ≥ 44px** (`@media (max-width: 768px), (pointer: coarse)`): category picker rows and expand buttons, category trigger, category manager rows (48px) and row actions, inventory filter chips and "Clear", the status / customer-type pills, table row actions.
6. Also fixed on phones: the Settings shop card no longer scrolls sideways (`.settings-form` column `minmax(0, 1fr)`, long values wrap).
7. **Settings save only on "Save Settings"** (`src/components/settings/unsaved-settings.tsx`): the shop-details and shop-settings forms report unsaved changes (`useUnsavedSettings`) to one `UnsavedSettings` provider on the page, which shows a bar pinned to the bottom of the screen ("Unsaved changes · Your shop · Shop settings", Discard / Save Settings) and asks before leaving (reuses `useLeaveGuard` + `LeaveDialog`: Keep editing / Discard changes / Save Settings). The per-form "Save Shop Details" / "Save Settings" buttons were removed. The save toasts list only the changed fields, one per line ("Print format updated to 80mm POS slip."; `describeChanges` compares with the form's `defaultValues` = last saved, in shop-settings-form; `dirtyFields` + `FIELD_NAME` → "Address updated." in shop-profile-form; sonner descriptions are `whitespace-pre-line`). The logo and product categories still save immediately (their own actions). `useLeaveGuard` now marks its guard history entry (`__carshopLeaveGuard` in `history.state`) and only steps back off it when it is the current entry (after a save that stays on the page, the old URL check sent "Discard changes" back to the wrong page).

---

### PHASE 12: Superadmin Schema, Shop Settings Columns & Resend Email [COMPLETED]
**Commit**: `193cfb5` (`Phase 12 - superadmin schema, shop settings columns and resend email`).

**What was built**:
1. **Migration** `supabase/migrations/20261019154032_superadmin_and_scaling.sql` (applied remotely under the same version):
   - `profiles.is_superadmin boolean not null default false` + partial index `profiles_superadmin_idx`; not in the `authenticated` column grants, so nobody can make themselves superadmin through the API.
   - `public.superadmin_audit_logs` (admin id, target tenant/user, action, details JSONB, IP, created_at; RLS on, no client policies: written/read by Phase 13 server code only).
   - `public.email_logs` (tenant id, recipient, template ∈ welcome / password_reset / staff_invite / document_share / payment_receipt, subject, resend id, status sent / logged / failed, error, metadata, sent_by, created_at). Shop admins can read their shop's rows; nobody can write them from the client (service role only).
   - `tenants`: `status` ('active' | 'suspended' | 'trial', not admin-writable), `invoice_prefix` / `quote_prefix` / `draft_prefix` (defaults `INV` / `Q` / `D`, `A-Z0-9` with single dashes, ≤ 10), `invoice_start_number` / `quote_start_number` / `draft_start_number` (default 1001; a floor, not a counter), `bank_name`, `bank_account_title`, `bank_account_number`, `bank_iban`, `bank_raast_id`, `bank_wallets` (JSON array), `invoice_terms` (≤ 2000; quotations keep `quote_footer_notes`). Length/format check constraints; column-level `grant update` to `authenticated` for the prefix / start / bank / terms columns (the Phase 1 "admins update their own tenant" policy applies). UI for these comes in Phase 14.
   - `next_document_number(p_prefix)` (Phase 5): `p_prefix` still names the series ('D' / 'Q' / 'INV', so `save_quote` / `convert_quote` are unchanged); returns `<shop prefix>-<greatest(highest number used in the series, start − 1) + 1>`, digits taken from existing documents whatever their old prefix; per-shop-and-series advisory lock. Verified: INV-1001 → INV-1002, a raised floor and a new prefix apply, admins can't set `is_superadmin` / `status` or write `email_logs`.
2. **Resend** (`resend@6.34.1`): `src/lib/email/client.ts` `deliverEmail()` — sends through Resend when `RESEND_API_KEY` is set (from `RESEND_FROM_EMAIL`, default `CarShop POS <onboarding@resend.dev>`; reply-to the shop's email), otherwise prints the email to the server console and returns `logged`. Until a domain is verified in Resend, mail only reaches the Resend account owner's address; the action turns that Resend error into a readable message.
3. **Templates** `src/lib/email/templates/`: `layout.ts` (shared HTML shell + text version, `escapeHtml`, button / facts helpers), `account.ts` (welcome, password reset with a 1-hour link, staff invite — used from Phase 13/14), `documents.ts` (document share: number, total, balance / valid-until, link to the customer page; payment receipt: amount, method, date, what is still owed).
4. **`sendTransactionalEmail()`** in `src/lib/email/send.ts` — `server-only` and deliberately **not** a server action (a server action would let the browser email any address: open relay). Logs every attempt to `email_logs` via the service-role client (`src/lib/supabase/admin.ts` comment updated), and refuses more than 100 emails per shop per hour. `src/lib/pdf.tsx` gained `documentPdf()` (the Phase 6 A4 PDF as bytes + safe filename) for attachments.
5. **Email to customer** (server action `emailDocument({ id, to, kind })` in `src/lib/actions/email.ts`: session check, document loaded through RLS so only the shop's own; cancelled / void documents refused). UI: Share menu (`share-menu.tsx`) → "Email to customer" on shareable documents → `src/components/quotes/email-dialog.tsx` (`ModalSheet`; recipient prefilled with the customer's email — `email` added to `CustomerOption` and its three selects; walk-ins start empty). The address can be changed for this send only; a hint under the field says the customer's profile isn't updated (edit the customer to change it for good; `.form-grid label > small` = muted helper text). Invoices with payments choose "Invoice" (A4 PDF attached + link) or "Payment receipt" (latest payment) with the Phase 3 `.radio-cards`. Toast on success; "logged" says email isn't set up on this server.
6. **Verified end to end**: INV-1001 sent as a document email (PDF attached) and as a payment receipt (sample payment, not saved) through the real pipeline; Resend reports both **delivered**, both rows in `email_logs` with status `sent`.

### PHASE 13: Superadmin Control Plane (`/admin`), Impersonation & Suspended Shops [COMPLETED]
**Commit**: `652c4ee` (`Phase 13 - superadmin control plane, tenants, users and impersonation`).

**What was built**:
1. **Migration** `supabase/migrations/20261019160720_superadmin_control_plane.sql` (applied remotely under the same version):
   - **Impersonation design (decided first, per the directive)**: a verified per-request claim honoured by `current_tenant_id()`, not service-role reads (which would mean rewriting every query). `public.impersonation_sessions` (token_hash = SHA-256 of a random token, admin, shop, started/expires/ended, IP; service role only). `private.impersonated_tenant_id()` reads the `x-carshop-impersonation` request header (PostgREST `request.headers`) and returns the shop only when the token's session belongs to `auth.uid()`, that user is still `is_superadmin`, and it hasn't ended or expired (2 h). Without the header it returns at once.
   - `private.current_tenant_id()` = impersonated shop, else the caller's own shop **unless it is suspended** (then null: a suspended shop's users see and change nothing).
   - `private.is_shop_admin()` (impersonating superadmin counts as the shop's admin, else own `role = 'admin'`) replaces the profiles lookups in the 5 admin policies (tenants update, categories insert/update/delete, email_logs select), which can't see a superadmin's own profile while impersonating.
   - `public.my_shop_status()` (caller's own shop status, for the login check). Service-role-only RPCs for the pages: `admin_platform_metrics()` (shops by status / new this month, users and sign-ins in 30 days, sales per currency incl. this month and collected, quotation / draft / invoice counts, sign-ups per month for 12 months), `admin_tenants(p_search, p_status, p_limit, p_offset)` (search name / handle / phone / email / any member's email; owner, users, invoices, sales, last sign-in, window total), `admin_users(p_search, p_limit, p_offset)`.
   - Verified in SQL (rolled back): token works only for its own superadmin (not a stolen-token user, not after superadmin is revoked, not after expiry), wrong token → own shop, suspended user → no shop and 0 rows, clients can't write sessions or call the admin RPCs.
2. **Request plumbing**: `src/lib/supabase/impersonation-header.ts` (cookie `carshop_impersonation`, header, 2 h TTL). `createClient()` (`src/lib/supabase/server.ts`) forwards the httpOnly cookie as the header, so all existing pages/actions/RLS work unchanged while impersonating. `src/lib/impersonation.ts` (`getImpersonation(userId)`, token helpers). `getShopSession()` (`src/lib/auth.ts`): impersonating → target shop's tenant + superadmin's own name (service role), role admin; adds `isSuperadmin` and `impersonating`; a suspended user is sent to `/auth/suspended` (route handler: sign out → `/login?error=suspended`).
3. **Guard & audit**: `src/lib/superadmin.ts` (`requireSuperadmin()` cached per request, reads `is_superadmin` with the service role; `isSuperadmin()`, `requestIp()`, `audit()`). Proxy (`src/lib/supabase/middleware.ts`): `/admin` → `/dashboard` for non-superadmins; while impersonating, every non-GET request (Server Actions post to the page and carry `next-action`) is logged as `impersonation.request` (method, path, action id, session); an ended/expired cookie is deleted.
4. **Actions** `src/lib/actions/admin.ts` (each `requireSuperadmin()` + service role + audit row): `startImpersonation` (ends the admin's earlier sessions, sets the cookie, → `/dashboard`), `endImpersonation` (banner Exit → `/admin/tenants`, logs minutes), `createOrganization` (`auth.admin.generateLink({ type: "invite", data: { shop_name, full_name } })` so the normal sign-up trigger provisions tenant, admin profile, categories and walk-in; then phone/status; welcome email with a "Choose your password" link), `setTenantStatus` (active / trial / suspended), `sendPasswordReset` (recovery link email), `setTemporaryPassword` (12 readable characters, shown once, never stored/logged), `setUserRole` (refuses to demote a shop's last admin). One-time links are built from `hashed_token` → `/auth/confirm?token_hash&type&next=/reset-password` (route handler: `verifyOtp`, no redirect allow-list needed) → `(auth)/reset-password` (new password twice, `setNewPassword` in `src/lib/actions/auth.ts` → dashboard). `signIn` refuses suspended shops with a polite message (`my_shop_status`); login page also explains `link_expired` / `suspended`. `welcomeEmail` gained `setPasswordUrl`.
5. **Company details reuse**: `updateShopProfile(values, tenantId?)` / `setShopLogo(url, tenantId?)` (`shopTarget()` in `src/lib/actions/settings.ts`: own shop via RLS, or any shop for a superadmin via service role with a before/after `tenant.update` audit) and `/api/shop/logo` (`tenantId` form field, superadmin only) — `ShopProfileForm` takes `tenantId` (title "Company details").
6. **UI** (`src/app/admin/`, `src/components/admin/`): layout with `admin-navbar.tsx` (dark slate, 3px racing-red rule, SUPERADMIN tag, Overview / Shops / Users links in Suspense, "My shop", user menu). **Overview**: KPI stat cards (shops, active users, platform GMV + this month + collected, open quotations + drafts), sign-ups bar chart (reuses `charts.tsx` `BarChart`), newest shops, recent activity (audit log in words, `format.ts describeAction`). **Shops** (`/admin/tenants`): search + status pills (`admin-filters.tsx`), table / phone cards, Create Organization dialog (`create-organization.tsx`, ModalSheet), per-row `tenant-actions.tsx` (Login As, Edit, Activate / Mark as trial / Suspend with ConfirmDialog). **Shop page** (`/admin/tenants/[id]`): status + totals, ShopProfileForm with the save bar, users with role select + password menu, this shop's activity. **Users** (`/admin/users`): cross-shop search, role select, password menu (`user-actions.tsx`: email reset link / temporary password dialog with Copy). `impersonation-banner.tsx` (shop name, end time, Exit) on every dashboard and admin page; user menu shows "Superadmin console" for superadmins. Styles: `.admin-*`, `.impersonation-banner`, `.temp-password` in globals.css (phones: icon-only nav).
7. **Verified**: typecheck + lint; browser test with temporary shops (34 checks): non-superadmin bounced from /admin, KPIs + chart, search by name / owner email, status filter, Create Organization (trial, phone, 157 categories, walk-in, welcome email logged), edit details + audit before/after, Login As banner on every page, settings show and save the target shop only, request audit rows, Exit (session ended, own shop back), temporary password sign-in, last admin can't be demoted, reset email logged, suspend signs a signed-in user out with the message and blocks sign-in, activate, recovery link → choose password → dashboard (new password works), no sideways scroll at 390px on all 4 admin pages, no browser console errors. Test data and audit rows removed.

---

### PHASE 14: Settings Sections, Team, Document Numbering & Bank Details [COMPLETED]
**Commit**: `d468d1e` (`Phase 14 - settings sections, team, numbering and bank details`).

**What was built**:
1. **Migration** `supabase/migrations/20261019173257_team_and_documents.sql` (applied remotely under the same version): `profiles.deactivated_at`; `private.current_tenant_id()` also returns null for a deactivated member (cut off at their next request) and `private.is_shop_admin()` ignores deactivated admins; `public.my_shop_status()` returns `'deactivated'` for them; `public.document_number_floors()` (authenticated, invoker: highest number used per series in the caller's shop, for the "next number" preview; same rule as `next_document_number`); `tenants_bank_wallets_size_check` (≤ 5 wallets). Verified in SQL (rolled back): deactivated → no shop, status `deactivated`, 0 quotes.
2. **Settings sections** (`src/app/(dashboard)/settings/layout.tsx` + one page per tab, `src/components/settings/settings-tabs.tsx`, scrolls the current tab into view on phones): **Profile** `/settings` (shop details + logo; terms moved out), **Localization** `/settings/localization` (currency, phone numbers, timezone & week, dashboard clock), **Categories** `/settings/categories`, **Team** `/settings/team`, **Documents** `/settings/documents` (numbering, terms, bank details, quotation validity), **Printing** `/settings/printing` (print format), **POS** `/settings/pos` (tax). The existing cards were moved, not rebuilt: `ShopSettingsForm` takes `sections` (`SettingsSection`) and saves **only those fields** (`updateShopSettings` accepts a partial; Next keeps other tabs mounted with older values, so sending everything would undo another tab's change). Each tab has its own Save Settings bar (`UnsavedSettings`); `shop-settings-section.tsx` renders a cards-only tab.
3. **Documents** (`src/components/settings/document-settings-form.tsx`, `updateDocumentSettings` in `src/lib/actions/settings.ts`, `src/lib/validations/document-settings.schema.ts`): prefix (typed lowercase is uppercased; capitals/digits, optional hyphens, ≤ 10) and "start from" per series (quotations, invoices, drafts) with a live **Next number** preview ("Already at 5001" when start-from is behind numbers already used; numbering never goes back). **Quotation terms** (`quote_footer_notes`) and **invoice payment terms** (`invoice_terms`): `loadPrintable` picks by document (`doc.shop.terms`), the PDF / share page label invoices "PAYMENT TERMS", the document screen shows "Payment terms" on invoices (`ShopSession.tenant.invoiceTerms`). **Bank details**: bank name, account title, account number, IBAN (Pakistani format + mod-97 checksum, stored without spaces, shown in groups of 4), Raast ID, up to 5 mobile wallets (JazzCash / EasyPaisa / SadaPay / NayaPay, mobile number, optional account name; `bank_wallets` jsonb).
4. **Bank Remittance**: `PrintableDocument.bank` is set only for invoices with a balance (not quotations, paid, void or cancelled invoices) when any bank detail exists. A4 PDF (`document-pdf.tsx` `BankRemittance`: red-ruled box below the totals, "Pay <balance> · reference <number>", two-column details) and `/share/[token]` (`.share-bank` card; `src/components/share/copy-button.tsx` **Copy IBAN** copies it without spaces, plus Copy for the account number). Thermal receipt / POS slip unchanged.
5. **Team** (`/settings/team`; `src/components/settings/team-manager.tsx`, `src/lib/actions/team.ts`, `src/lib/team-data.ts`, `src/lib/validations/team.schema.ts`): members with avatar, role, status (**Active** / **Invited** = never signed in / **Deactivated**) and last sign-in. **Invite Team Member** (name, email, Staff/Admin): refuses an email that already has an account; `auth.admin.createUser` without `shop_name` (so the sign-up trigger creates no shop) + profile in this shop (service role, pinned to the caller's tenant from `getShopSession()`); emails `staffInviteEmail` with a one-time link (`generateLink` recovery → `/auth/confirm` → `/reset-password`, 1 hour). Per member: role select (the shop always keeps an active admin), **Resend invite** / **Cancel invitation** (removes the account) for invited members, **Deactivate** (confirm; bans the auth user and sets `deactivated_at`; their documents stay) / **Reactivate**. You can't deactivate yourself. Staff see the list read-only. Deactivated users: next page → `/auth/suspended?reason=deactivated` → `/login?error=deactivated`; sign-in refused (`user_banned` / `my_shop_status`) with "Your access to this shop has been turned off…". Account-link helpers moved to `src/lib/account-links.ts` (shared with `src/lib/actions/admin.ts`).
6. Notification bell and global search ignore a non-JSON reply (a signed-out request redirected to the login page) instead of throwing.
7. **Verified**: typecheck, lint, `next build`; browser test against the production build with a temporary shop (53 checks): 7 tabs and their cards, a POS save keeps Localization's change, numbering preview + saved prefix/start, bad IBAN refused, IBAN/wallet normalised, invoice numbered ZZ-INV-5001 / quotation Q-1001, invoice PDF has Bank Remittance + payment terms (pdftotext) and the quotation PDF has quotation terms and no bank box, share page bank card + Copy IBAN, paid invoice has no bank card, invite (duplicate refused, Invited, staff_invite logged, no extra shop), invitee signs in → Active, staff read-only, roles + only-admin guard, deactivate signs the member out and blocks sign-in and API reads, reactivate, cancel invitation removes the account, no sideways scroll at 390px, only the success toast after a good save, no browser console errors. Phase 13 suite re-run on the same build: 34/34. Test data removed. Note: the running `next dev` served a stale `printable.ts` to the share page during testing (restart it if the share page shows no bank card).

---

### PHASE 15: Inventory CSV Import/Export, Chart Labels, 4K Containment & Final Build [COMPLETED]
**Commit**: `dafe024` (`Phase 15 - inventory csv import/export, chart labels and 4k containment`).

**What was built**:
1. **Migration** `supabase/migrations/20261019182238_inventory_csv_vehicle_match.sql`: `public.match_vehicles(p_specs jsonb)` (authenticated, invoker so the vehicles RLS applies): `[{label: "suzuki alto", from, to}]` → `(spec_index, vehicle_id)` rows, matching `lower(make || ' ' || model)` exactly ("Alto" ≠ "Alto Lapin") within the years.
2. **CSV helpers** `src/lib/csv.ts` (`toCsv`, `downloadCsv` with BOM, `parseCsv`: quotes, `""`, CRLF, multi-line cells, `;`-separated Excel files, blank lines dropped); the Phase 6 reports `CsvButton` now uses it. **Inventory CSV rules** `src/lib/inventory-csv.ts` (browser + server): columns SKU, Name, Category, Cost Price, Sale Price, Stock, Universal, Vehicles, Vendor, Low Stock Alert, Price Includes Tax, Description, matched by header name in any order with common synonyms ("Part Code", "Qty", "Supplier", "Category Path"…); SKU / Name / Category / Sale Price columns required; ≤ 1000 rows. Money cells accept "Rs. 1,200". **Vehicles cell**: `2018-2022 SUZUKI Alto; 2020 Honda Civic` (year or range + make + model, any capitals); export collapses consecutive years into ranges. Category: full path with ›, > or / (any capitals), or a category's own name when only one category has it. `TEMPLATE_ROWS` = the downloadable template.
3. **Actions** `src/lib/actions/inventory-csv.ts` (caller's session / RLS): `checkInventoryCsv(rows, updateExisting)` returns per row new / update / error with every problem (unknown category, unknown vehicle, unreadable vehicle entry, duplicate SKU in the file, SKU already in the shop unless updating, not-a-number, Yes/No, Universal + vehicles, vehicle-specific with no vehicles, and all `inventoryItemSchema` rules); `importInventoryCsv(batch ≤ 100, updateExisting)` re-checks and saves each row through `save_inventory_item` (same rules as the part dialog; SKU race / stock-below-reservations reported per row); updates keep the current value for empty cells or missing columns (fitment too). `exportInventoryCsv()` pages through **every** item (1000 per request), in the template's columns (category path, vehicles cell), so an export re-imports cleanly.
4. **UI** `src/components/inventory/csv-import-dialog.tsx`: Inventory heading gets **Export CSV** (`inventory-YYYY-MM-DD.csv`) and **Import CSV** (dialog: choose file, Download template, "Update items with the same SKU" (re-checks), column help → preview with new / to update / with problems counts, problem rows highlighted with each reason, "Show problems only" → Import N items in batches with a progress bar → result with any rows not saved; the list refreshes).
5. **Chart labels** (`charts.tsx`): `.chart` is a size container; when a chart is under 480px wide every other shown label (`.chart-label-alt`) is hidden (`@container (max-width: 480px)`), so dates don't collide on phones (or in narrow cards).
6. **Large screens**: `.page` uses `max-width: var(--container-max-width)` (1720px), centred.
7. **Verified**: `npm run lint` and `npm run build` pass. Helper tests (parser, synonyms, money, vehicles parse/format, category paths). Browser test on the production build (21 checks): mixed file → 3 new / 5 problems with the right reasons, import saves 3 (SKUs upper-cased, "Rs." parsed, Alto mats linked to 8 vehicles, category by leaf name), existing SKU refused until "update" is ticked, update keeps empty-cell values, 30-row import, export has all 33 items (more than a page) with paths and vehicles and re-imports as 33 updates with no problems, report chart labels 7 → 4 at 390px (all 7 on desktop), 4K page 1720px centred, **no sideways scroll on 11 pages (dashboard, inventory, quotations, invoices, drafts, customers, reports, settings, documents, team, new quotation) at phone 390, tablet 820, laptop 1366, desktop 1920 and ultrawide 3440**, no browser console errors. Test data removed.

---

### PHASE 16 (Version 2): ProductLogik Rebrand, Accent Colour, Urdu PDFs, What's New & Dark Mode [COMPLETED]
**Commit**: `e06086c` (`Phase 16 - productlogik rebrand, accent colour, urdu pdfs, whats new and dark mode`). Plan: `docs/upgrade-plan.md` Phase 16, RF-16.1–16.4.

**What was built**:
1. **Migration** `supabase/migrations/20261019202258_phase16_brand_accent_whats_new.sql`: `tenants.accent_color` (`#rrggbb` check, column grant to `authenticated`), `profiles.whats_new_seen` (≤ 40 chars, column grant), and `private.impersonated_tenant_id()` reads `x-productlogik-impersonation` first, then the old `x-carshop-impersonation` (until Phase 33). `database.types.ts` patched by hand.
2. **Brand**: ProductLogik mark copied unchanged from the brand source (`public/brand/mark.svg|png`, `mark-mono.svg`, `src/app/icon.svg`, favicon, apple icon, `public/icons/*` incl. a maskable PWA icon); `src/app/manifest.ts` (name, short name "ProductLogik", emerald theme colour; `/manifest.webmanifest` public in the proxy). `carshop_logo/` and the Next.js starter SVGs deleted. Plus Jakarta Sans with a Noto Sans Arabic fallback. `package.json` `productlogik-pos@2.0.0-alpha.0`; layout metadata `%s · ProductLogik POS`.
3. **Tokens** (`globals.css`): emerald/slate palette, `--accent-brand*` replace `--blue*`, semantic tokens (`--on-color`, `--success-bg`, `--danger-bg`, `--danger-text`, `--warning-text`, `--ring-soft`, `--glass-rgb`…). `scripts/check-contrast.mjs` (`npm run check:contrast`): 48 light/dark/document pairs, all WCAG AA.
4. **Copy**: CarShop → ProductLogik and parts → products across the app, PDFs, slip, share page, emails and admin. Version 1 keys are still read (sidebar `carshop.sidebar`, `carshop.seenAlerts`, the leave-guard mark, the `carshop_impersonation` cookie) so nothing resets after the deploy.
5. **RF-16.1 accent colour** (`src/lib/accent.ts`): 8 presets + picker in Settings → Profile (superadmin parity in `/admin/tenants/[id]`), rejected below 4.5:1 on white; used on the A4 PDF, the share page and emails (default emerald 700 `#047857`); the POS slip stays black.
6. **RF-16.2 Urdu/Arabic in PDFs**: Noto Sans Arabic TTFs + OFL in `src/assets/fonts`, registered in `src/components/pdf/fonts.ts`, shipped with `outputFileTracingIncludes`; shaping and right-to-left order verified on the A4 PDF and slip.
7. **RF-16.3 What's new**: `src/lib/changelog.ts` (entries, newest first), `src/lib/actions/whats-new.ts` (stores the seen id), `shared/whats-new.tsx` (gift icon in the top bar with a dot until seen).
8. **RF-16.4 dark mode**: `next-themes` via `shared/theme-provider.tsx` (class on `<html>` before paint, no flash), Light / Dark / System in the user menu, sonner follows the theme; `.dark` token block (inverted slate ramp, `color-scheme: dark`); always-light scopes re-declare the light tokens (sidebar chrome, auth aside, admin navbar, impersonation banner, share page, POS slip on screen and in print). The A4 PDF and emails are unaffected.
9. **Docs**: README rewritten, this spec's title/vision/§2.1 updated, Mac setup clone URL, `docs/regression-checklist.md` created. GitHub repo renamed to `hamzi207/productlogik-pos` and `origin` updated (the old URL redirects; the local folder is still `carshop_pos`).
10. **Verified**: `npx tsc`, `npm run lint`, `npm run check:contrast` and `npm run build` pass. Browser check on the dev server: the served CSS has the dark block; light and dark on dashboard, inventory, customers, invoices, new invoice, reports and settings at desktop 1440 and phone 393, plus the add-product dialog; the `dark` class is on `<html>` per the stored theme, no console errors. Supabase advisors: no new findings (the remaining ones date from Version 1). Test data removed.

---

### PHASE 17 (Version 2): Superadmin Console, Subscriptions & Manual Billing [COMPLETED]
**Commit**: `Phase 17 - superadmin console, subscriptions, billing and separate superadmin accounts`. Plan: `docs/upgrade-plan.md` Phase 17 (deliverables 1–9, RF-17.1, RF-17.2, RF-17.4).

**What was built**:
1. **Migrations** (`supabase/migrations/2026102*_phase17_*.sql`, 13 files): control plane (organization limits, status reasons, archive columns, impersonation modes), `private.pre_request` (read-only Login As makes the transaction read only; `service_role` needs `usage on schema private`, fixed in `…072436`), subscription plans / tenant subscriptions / invoices / payments / adjustments / history and events, console tables (notes, tags, follow-ups, health snapshots, announcements, platform settings), billing RPCs (full payments only, no part payments), admin tools (`my_status_reason`), `admin_near_limits`, the vehicle catalog (`vehicles.deactivated_at`, `admin_vehicles`, `admin_merge_vehicles`), and **`platform_admins`** (`…074800`).
2. **Superadmins are separate accounts** (product owner, 2026-10-21): `public.platform_admins` (service role only; removed admins keep their row for the audit log and are banned); `profiles.is_superadmin` dropped; a trigger keeps an account from being both a shop user and a superadmin. They sign in at **`/admin/login`** then **`/admin/mfa`** (route group `src/app/admin/(auth)`; console pages in `src/app/admin/(console)`, same URLs). The shop `/login` refuses superadmin accounts and `/admin/login` refuses shop accounts; a superadmin opening a shop page goes back to `/admin` except during Login As; sign-out returns each to its own sign-in. `app_metadata.platform_admin` is the proxy's routing hint, the table grants access (`requireSuperadmin()`). Quotes and payments made during Login As record the auth account (`created_by` now references `auth.users`). Team → Add Superadmin creates the account and emails an invitation (`superadmin_invite`); an email that belongs to a shop is refused (Gmail `name+admin@` works).
3. **Two-factor (RF-17.1)**: TOTP enrol / verify at `/admin/mfa` (one enrolment even when React runs effects twice), `aal2` required by the proxy, `requireSuperadmin()`, the export routes and Login As. `supabase/config.toml` has TOTP enabled. Founder guide §9 covers going live and lockout recovery.
4. **Organization page tabs** (`/admin/tenants/[id]`): Overview (summary, health score with 90-day trend, notes, tags, follow-ups, danger zone), Profile, Localization, Documents, Printing & POS, Categories, Users (team manager with sign out everywhere, make owner, delete account, CSV invite of up to 50), Subscription, Data (full ZIP export of 16 tables + files, superadmin only and audited; reconciliation checks), Activity. Suspend with a reason shown at sign-in; archive (reason + typed name, signs everyone out) and restore; never deleted.
5. **Shops list**: Archived filter, tag / health / sort filters, health column, tags, next follow-up, archive-age row colours (13 steps over a year) with a legend.
6. **Subscriptions & billing (deliverable 9)**: superadmin-made plans (three starting plans, monthly and yearly only, custom plans from a client), plan per organization with trial, agreed price and discount, invoices, payments by wallet or bank recorded or verified by the superadmin (full payments only), grace period, unpaid suspension to `/subscription-due`, the organization's Settings → Subscription page and payment reporting with a screenshot, daily run at `/api/cron/subscriptions` (`CRON_SECRET`), reminder / receipt / notice emails, Billing overview with CSV export.
7. **Console pages**: Overview with Needs attention (follow-ups due, at-risk, near plan limits), Users, Plans, Billing, Audit (filters, details, CSV), Team (superadmins, reset two-factor), Platform (seller details, payment accounts, billing defaults, sign-up, email sender, announcements shown as a banner in every organization), Platform → Vehicle catalog (search, add, edit, deactivate, merge).
8. **Shared**: light / dark button in the shop top bar and the console bar (`shared/theme-toggle.tsx`); System stays in the user menu. The shop user menu no longer links to the console.
9. **Fixes found in testing**: `profiles` → `tenants` embeds name the foreign key (`tenants!profiles_tenant_id_fkey`) now that `tenants.owner_id` also links them (it caused a `/dashboard` ↔ `/login` reload loop); an account with no shop is signed out (`/auth/suspended?reason=no_shop`) instead of looping.
10. **Verified**: `npx tsc`, `npm run lint` and `npm run build` pass. Browser tests with temporary accounts (deleted afterwards): two-factor 9/9 (QR, code, wrong code refused, second sign-in code only) and separation 20/20 (both sign-ins refuse the other kind of account, two-factor, theme button, no cross links, superadmin kept out of shop pages, Login As and Exit, sign-out, shop user view). Supabase advisors: nothing new except the dashboard setting for leaked-password protection.

**Not built (deferred)**: document overrides (delete a document with payments, reopen a cancelled one, audited stock correction); platform default lists and console imports of customers, suppliers and opening balances (those features arrive in later phases); permission bypass and auto-approvals while acting as an organization (Phase 22). The daily run's scheduler (Vercel Cron or `pg_cron`) is chosen at deploy time.

---

### PHASE 18 (Version 2): Industries, Superadmin Category Catalogs, Attributes & Onboarding [COMPLETED]
**Commit**: `Phase 18 - industries, category catalogs, attributes and onboarding`. Plan: `docs/upgrade-plan.md` Phase 18 (deliverables 1–11, RF-18.1, RF-18.2, RF-18.3; Rev 7 and Rev 8).

**What was built**:
1. **Migrations** (`supabase/migrations/2026102*_phase18_*.sql`, 9 files): `phase18_industries` (`public.industries`, 14 launch industries with default modules / UOMs / settings and `onboarding_steps`; `tenants.industry_id`, `tenants.modules`, `tenants.onboarding_dismissed_at`; `private.current_industry_id()`, `tenant_has_module`, `my_modules`, trigger `tenants_industry_defaults`), `phase18_category_catalogs` (categories get `industry_id`, `sku_prefix`, `icon`, `color`, `image_path`, `is_archived`, `created_by`; nullable `tenant_id` with exactly-one-scope check; the Automotive catalog built from the V1 tree; the existing shop's 157 categories matched by path, 0 own and 0 hidden; `tenant_hidden_categories`; `category_requests` (20 a day per organization); public `category-images` bucket (1 MB, PNG / JPG / WebP); `private.check_item_category`; `admin_category_usage`, `admin_remap_tenant_industry`), `phase18_seed_catalogs` (13 more trees, 1,052 rows, from `docs/category-templates/`), `phase18_attributes_onboarding_fitment` (`category_attributes`, `inventory_items.attributes` + validation trigger, `save_inventory_item(p_attributes)` and search / `add_vehicle` gated by the Vehicle Fitment module, `private.onboarding_status`, `my_onboarding`, `admin_onboarding`, `admin_onboarding_summary`), `phase18_category_emails`, `phase18_hidden_branches` (a catalog category added or moved under a hidden branch stays hidden; an own category can't go under a hidden parent), `phase18_superadmin_creates_organizations` (Rev 8: on-signup trigger, `signup_open()`, `signup_industries()` and `platform_settings.signup_open` dropped; service-role `admin_create_organization`), `phase18_onboarding_walk_in` and `phase18_remap_attributes` (fixes found in the browser checks, items 11–12).
2. **No self sign-up** (Rev 8): `/register`, its form and action are removed; the superadmin creates every organization (Create Organization picks one of the open industries; invite link → `admin_create_organization`, which deletes the auth user if it fails). Supabase Auth sign-ups are off. The shop `/login` is the only auth page in the proxy.
3. **Console → Catalog** (one nav item with a pending-request count; tabs Industries, Categories, Attributes, Vehicle catalog, Requests; side list of industries, defaulting to the one with most organizations): industries (add, edit, close for new organizations, delete only when unused; default modules, settings, onboarding steps), the catalog tree editor (add, rename, prefix, icon, colour, image, move, reorder, archive / restore with everything below, delete only when unused, at most 4 levels, usage counts), duplicate another industry's tree, CSV import with a preview, CSV export, attributes per industry or category, and the request queue (approve for the organization only or for its whole industry, or decline with a reason; the requester gets an email and a bell alert). All writes are service-role actions in `src/lib/actions/admin-categories.ts` / `admin-industries.ts` with audit rows.
4. **Organization page tabs** (`/admin/tenants/[id]`): Products (add, edit, delete the organization's items), Categories (its effective tree, hide / show catalog categories, own categories anywhere, own attributes), Industry & modules (re-mapping wizard: auto-match by path then name, Change stays disabled until every used category has a new home; Vehicle Fitment switch; the setup checklist). Overview shows subscription, payment due, industry and setup %. The Organizations list has a Setup column. Subscription → Change start date (only before the first invoice). The console says "Organizations" everywhere.
5. **Shop side**: Settings → Categories is a read-only browser (archived categories show dimmed only while items use them) with **Request a category** (`category-manager.tsx` deleted). Pickers, filters, CSV and search show only the organization's visible, unarchived categories; CSV import never creates categories. Settings → Profile shows the industry and modules. The Settings tab row wraps on screens wider than a phone (it scrolled sideways with a hidden scrollbar and cut off "Subscription").
6. **Vehicle Fitment module** (on for Automotive by default): when off, the dialog's Universal / Vehicle Specific and vehicle picker, the fitment and vehicle columns, the fitment filter, vehicle search hits, the CSV `Universal` / `Vehicles` columns and `/api/vehicles` (403) are gone and items save as universal; stored fitment is kept. With it on, the fitment UI is the V1 code, only wrapped in the module flag.
7. **Attributes (RF-18.1)**: text, number, date, yes / no and list types; required and "show on documents" flags. They appear in the product dialog under the category, as list / yes-no filters (`?attr.<key>=`), in search text, as CSV `attr:<key>` columns (template, import, export) and under the line description on the PDF, slip and share page (`printable.ts` `attributeDetails`). Archived attributes keep stored values. `actions/inventory.ts` passes `p_attributes`, so editing an item no longer clears them.
8. **Colours & images (RF-18.2)**: an 18-colour palette that reads in both themes and an optional image, shown in the picker, editor, browser, inventory badges and the phone document-search chips (stocked main categories with colour dots). Size and type are checked in the browser, the action and the bucket.
9. **Get started (RF-18.3)**: dismissible dashboard card for org admins with 9 steps worked out from the organization's data; the superadmin sees the same % on the Overview and in the Organizations list.
10. **Other**: the notification bell shows the outcome of the user's own category requests (14 days); `category_request` / `category_request_result` emails; the profile menu no longer has Light / Dark / System (the top-bar button is the only theme control); wording "parts" → "products".
11. **Fix: setup step "first customer"** (`…151655`): every organization's automatic Walk-in / Cash customer ticked it from day one; only real customers count.
12. **Fix: changing the industry** (`…200137`): the organization's own attributes kept pointing at the old catalog, those on its own subcategories were cascade-deleted, and values of the old industry's attributes became "Unknown attribute" (the item, and even the move, couldn't be saved). Now an own attribute follows its category's mapping or is archived without a category; old-industry attributes that items hold values for are kept as archived own attributes; an active own key the new industry also has is refused with a message (archived ones give way).
13. **Changes from the owner's test (2026-10-24)**: the product is called **ProductLogik Invoicing System** in the UI (sidebar wordmark, sign-in pages, tab titles, manifest, emails, PDFs, share page, console, two-factor issuer); the repo, folder and package stay `productlogik-pos`, and "80mm POS slip" and the Settings → POS tab keep their names. "Built by Hamza Latif" (links to hamzalatif.com) under the product name in the sidebar and sign-in footers (`BuiltBy` in `shared/brand.tsx`). Search boxes wait longer before searching (`src/lib/search-delay.ts`: 500 ms for list filter boxes, 300 ms for dropdown lookups), and the Inventory box no longer overwrites newer typing when its own URL update lands. "free" stock wording → "available" (top-bar search, bell stock alerts, Reports low-stock heading and CSV). The shop logo shows in a 56 px white tile beside the Overview greeting (44 px on phones; nothing without a logo) unless an admin turns off **Show logo on Overview** (`tenants.show_overview_logo`, default on, migration `…191236`; Settings → Localization, where the "Dashboard clock" card is now "Overview page"; the console Localization tab has the same switch). Shop Settings uses the console organization-page layout: full width, forms up to 1,100 px, rows as label | control (`.shop-settings`); the 820 px cap made the tabs look cramped. The unsaved-settings bar is styled like the top bar and fixed to the bottom of the window, from the sidebar edge to the right edge (`--shell-left` on `.main-shell`). "Changes discarded" toasts are amber (`notify.warning`), and toast colours were checked against their purpose (rules in `src/lib/notify.ts`): "Email not sent" (only logged) and "Plan created but not assigned" → amber, "Logo removed" → green, inventory CSV import → green / amber "partly imported" / red "Nothing imported" (it showed nothing when every row failed).
14. **Verified**: `npx tsc`, `npm run lint` and `npm run build` pass. SQL isolation test 36/36 (rolled back). Real data: the automotive shop's 3 items keep their category paths, 157 categories / 14 roots. Browser checks with temporary organizations and a temporary superadmin (all deleted afterwards): Electronics tree only and no vehicle UI; attributes appear only for their category, required enforced, kept on edit, filter, search, CSV round trip, printed when flagged; invoice slip / PDF / share page details; request → approve (organization only) → bell and picker; archive → hidden from pickers, kept on the item; wizard both ways with attributes following; image limits; colours in light and dark; Create Organization (grocery) → grocery tree, 0 of 9 steps.

**Not built / changed from the plan**: the console has no notification bell, so a new request shows as the Catalog count and the Requests tab (plus the email). An organization's own subcategory under an archived catalog category is hidden in its pickers but not marked archived in the database. Linking extra industry catalogs to one organization is RF-18.4 (not taken). The automotive shop's fitment screens weren't screenshot-compared with V1 (its account has two-factor sign-in); the code path is unchanged apart from the module flag.

### PHASE 19 (Version 2): Units of Measure, Decimal Quantities & Retail-Neutral Customers [COMPLETED]
**Commit**: `Phase 19 - units of measure, decimal quantities, customer types and tags`. Plan: `docs/upgrade-plan.md` Phase 19 (deliverables 1–6, RF-19.1, RF-19.2, Rev 9).

**What was built**:
1. **Migrations** (`supabase/migrations/2026102*_phase19_*.sql`, 7 files): `phase19_uom_decimal_qty` (`uom_presets`, `units_of_measure` per organization with `decimals` 0–3, `item_uom_conversions` with factor / own price / barcode unique per organization; `private.seed_tenant_lists` seeds units from the industry when an organization is created or changes industry; `inventory_items.base_uom_id` backfilled to `pcs`, `purchase_uom_id`, `sale_uom_id`; quantities `numeric(14,3)` with the generated columns recreated; `quote_items.uom_id`, `uom_label`, `uom_factor` snapshots; triggers that keep conversions valid, block changing the base unit once an item is on documents, null a purchase / sale unit whose conversion is removed and check decimals per unit; `quote_items_sync_stock`, `save_inventory_item` and `save_quote` rewritten with one signature each), `phase19_item_unit_grants` (per-column grants for the new item columns), `phase19_customer_types_tags` (`industries.default_customer_types`; `customer_types` with `requires_tax_details`, one default, archive; `customers.customer_type` is a foreign key to `(tenant_id, name)` with ON UPDATE CASCADE, so renames follow; `check_customer_type` refuses archived types and requires a CNIC / NTN for flagged types; `customer_tags`, `customer_tag_links`, `set_customer_tags`), `phase19_reports_defaults` (`set_default_customer_type`, `is_default` not directly updatable; decimal messages per unit; `report_data(p_tag)` and unit codes in products / low stock; `shop_alerts` low stock with units), `phase19_scan_pack_barcode` (`search_inventory_items` also matches a pack's barcode exactly) and `phase19_pack_settings` (`tenants.packs_enabled`, off by default, column grant for admins; `units_of_measure.is_pack` / `uom_presets.is_pack`; turning packs on adds Box, Carton, Pack and Dozen if missing; `check_item_conversion` refuses a new pack while packs are off or in a unit not marked as a pack, while re-saving an existing pack still works) and `phase19_more_unit_presets` (owner request 2026-10-25: presets for mm, in, rft, sqm, sqyd, cbm, cft, ton, lb, gal, roll and sheet; measuring industries list more of them, e.g. Automotive adds ft, sqft, sqm and roll; existing organizations reseeded, additive only).
2. **Units & decimals**: the product dialog has a UNIT select, prices "per {unit}", decimal steps for weighed units and a **Packs & other units** section (unit, how many base units it holds, optional own price, optional barcode); inventory list, details panel, top-bar search, bell alerts, line search, PDF, thermal slip, POS slip and share page show quantities with their unit ("1.25 l", "27 pcs"). Shared helpers in `src/lib/uom.ts` (`unitOptions`, `formatQty`, `stepFor`, `fitsDecimals`).
3. **Document lines in packs**: each line has a unit select (a label when the product has one unit); price follows the unit (its own price, else base price × factor); stock checks and reservations convert to base units; scanning a pack's barcode in the line search finds the product and starts the line in that pack (a separate line when the product is already there in another unit). Discount per unit on printouts no longer divides by zero.
4. **Purchase & sale units (RF-19.1)**: optional per product, each the base unit or one of its packs; new document lines start in the sale unit. Shown in the dialog and details panel; CSV columns `Unit`, `Other Units` (`box=12; carton=144@15000`), `Purchase Unit`, `Sale Unit` in the template, import (blank keeps, `none` clears packs) and export.
5. **Pack settings** (owner request 2026-10-25, plan Rev 9): Settings → Units has a **Sell and buy in packs** switch, saved from the page's **Save Settings** bar like the other settings tabs (Discard puts it back; leaving with it changed asks first; switching off shows a note when products already have packs: they're kept and come back when it's on again). **Add unit** offers a **Common unit** pick of the platform presets the organization doesn't have yet (fills code, name, decimals and the pack flag) and a **Pack** column / **Can be a pack** checkbox per unit. The product dialog's section is now **Packs & selling units**: **Sell in** and **Buy in** at the top list the product's own unit, its packs and every other pack unit ("· new pack"); picking a new one adds its row with the cursor on "holds"; pack rows offer only pack units. With packs off the section is hidden (a note under UNIT points to Settings), documents and the line search offer base units only (lines saved in a pack keep it), a scanned pack barcode adds the base unit, and the details panel marks kept packs "switched off". The console's Units & customers tab has the same switch.
6. **Customer types**: per organization, seeded from the industry (Automotive keeps Dealership / Fleet Account; others Retail / Wholesale / Corporate (B2B)). The customer dialog lists active types; "needs tax details" types require a CNIC or NTN. The directory's business-accounts stat counts flagged types. The walk-in customer uses the default type.
7. **Customer tags (RF-19.2)**: palette-coloured tags; staff assign them in the customer dialog (it loads types and tags when it opens); chips on the customer list (desktop and phone) and profile; `?tag=` filter next to the type pills; **Export CSV** on the customer directory with a Tags column; Reports has a tag select (kept when the dates change) that limits sales, customers, payments and money owed, and CSV file names include the tag.
8. **Settings**: new tabs **Units** (add, edit, archive, delete unused) and **Customers** (types: add, rename, tax flag, make default, archive, delete unused; tags: add, rename, recolour, delete with customer counts). Staff see them read-only. Server actions in `src/lib/actions/lists.ts`, cards in `src/components/settings/list-managers.tsx`.
9. **Console parity**: organization tab **Units & customers** (`/admin/tenants/[id]/lists`) with the same three cards through `resolveTarget()` (service role, audited `unit.*`, `customer_type.*`, `customer_tag.*`). The console Products tab has the UNIT select and decimal stock.
10. **Verified**: `npx tsc`, `npm run lint` and `npm run build` pass. Rolled-back SQL tests: 2 box + 3 pcs takes 27 pcs; 1.25 l leaves 19.25; prices and costs scale by the factor; 1.5 pcs refused; base-unit change blocked once on documents; renames cascade to customers; tax details required for flagged types; archived types refused; one default; duplicate unit codes and tag names refused; a used unit or type can't be deleted and the default can't be deleted or archived; deleting a tag removes only its links; report tag filter; pack barcode scan (exact only); packs off refuses a new pack, switching on adds Box / Carton / Pack / Dozen, a litre pack is refused, an existing pack re-saves while off. Real data: 3 items on pcs, the V1 quote total 172.50 unchanged, one overload per rewritten function.

**Not built / changed from the plan**: purchase units ("Buy in") are stored and shown but only used once purchase orders and goods receiving arrive (Phase 25, built in sequence; plan Rev 9 records that PO lines are entered in packs and received in base units); statements and price lists use tags when they arrive (Phases 30, 26). The console Products tab sets the base unit only; packs and purchase / sale units are edited in the organization's own product dialog. Custom customer types show a neutral badge (the seeded Dealership / Fleet Account keep their colours). Products have no barcode of their own (the SKU is scanned); only packs carry barcodes.

---

### PHASE 20 (Version 2): Multiple Stores & Per-Store Stock [COMPLETED]
**Commit**: `Phase 20 - multiple stores, per-store stock, store prices and numbering`. Plan: `docs/upgrade-plan.md` Phase 20 (deliverables 1–8, RF-20.1, RF-20.2, Rev 10). Migrations applied to the live database 2026-10-25; the backfill left every item's stock, every document and every line unchanged. Rolled-back database checks passed (store rules, per-store stock and availability, selling across stores by setting and role, store prices, per-store numbering, opening stock and adjustments, store filters, plan usage, reconcile).

**What was built**:
1. **Migrations** (6 files, applied 2026-10-25; the last two, `20261025133202_phase20_invoice_facts` and `20261025135431_phase20_invoice_due_date`, are item 9):
   - `20261025060617_phase20_stores`: `stores` (name, code, address, phone, NTN, STRN, main flag, active flag, order; names and codes unique per organization), `profile_stores` (stores a member works in; no direct tenants FK, so profiles ↔ tenants embeds stay unambiguous), `profiles.default_store_id`, `stock_levels` (PK item + store, `on_hand` / `reserved` `numeric(14,3)`, optional per-store low-stock level), `stock_movements` (the ledger: type, quantity and reserved change, balances after, unit cost, document, user, time), `store_item_prices` (RF-20.1), `quotes.store_id` (not null) and `quote_items.source_store_id` with composite FKs `quotes_store_fkey` / `quote_items_source_store_fkey`, tenant settings `allow_cross_store_invoicing`, `cross_store_invoicing_roles` (`managers` | `all`) and `number_per_store` (RF-20.2).
   - Backfill: a **Main Store** per organization, each item's V1 stock moved into it with an `opening` movement, V1 documents and lines put in Main Store, every member given Main Store; it aborts if any item's total changes.
   - Helpers `private.my_work_store_ids()`, `can_work_in_store()`, `default_store_id()`, `can_invoice_other_store()` and `public.my_work_stores()`. Triggers: store rules (the main store can't be switched off or deleted, a code is required while numbering per store, the plan's store limit `plan_limit:stores`), a store with history can't be deleted, numbering per store needs every open store to have a code, new organizations get a Main Store, members' default store must be one of theirs.
   - `private.apply_stock` is the only stock writer: it locks the store's row, writes the movement and keeps `inventory_items` totals equal to the sum over stores. A direct change to an item's quantity raises "Stock is kept per store". Members can no longer write `quantity_on_hand`.
   - `20261025061033_phase20_documents`: documents default to the member's store and can only be created in a store they work in; a document can't change store while its lines hold stock. `quote_items_sync_stock` reserves / deducts at the line's source store; a line from another store needs the setting on and the right role ("Only admins can sell from another store's stock." / "Selling from other stores' stock is switched off (Settings → Stores).") and an open store; not enough stock says what the other stores have. `save_quote(p_store_id)` prices lines at the document's store (store price, packs with their own price keep it), `convert_quote` checks the store, `next_document_number(p_prefix, p_store_id)` numbers per store (`LHR1-INV-1001`, continuing from the store's highest number), `save_inventory_item(p_store_id, p_store_settings)` sets opening stock / adjustments at the current store and (admins) store prices and low-stock levels (through the definer helpers `private.set_item_stock` / `set_item_store_settings`, since members can't write stock or store prices directly), and the service-role `admin_set_store_stock` for the console.
   - `20261025113733_phase20_store_access` (Rev 11): members keep only the privileges the app uses on the Phase 20 tables (select; stores: insert / update of the detail columns, not `is_active` / `is_main`; profile_stores: insert / delete); no member deletes a store; the store-limit message points to the subscription.
   - `20261025061231_phase20_store_filters`: `filter_documents`, `document_list_totals`, `dashboard_metrics`, `report_data` (stock section uses one store's stock and prices) and `shop_alerts` (per-store low stock) take `p_store_id` (null = every store); `inventory_items_at_store` (in / out / low stock at one store); `admin_near_limits` counts stores; `admin_reconcile_tenant` checks reservations per store; `my_subscription` counts open stores.
2. **Settings → Stores** (`/settings/stores`, admins edit, staff view): stores list (admins add stores up to the subscription's store limit and edit them; the console also switches stores off / on and deletes one without history; how many products each prices differently; the subscription's store count, and at the limit a note to request a plan change; Rev 11); **Selling across stores** (allow invoicing from other stores' stock; who: managers and admins (admins until Phase 22) or everyone who can invoice) and **Document numbers** (number per store, only once every open store has a code), both saved from the Save Settings bar; **Who works where** (each staff member's stores and default store; admins work everywhere). Console parity: organization tab **Stores** (`/admin/tenants/[id]/stores`, service role, audited `store.*`). Actions in `src/lib/actions/stores.ts`, cards in `src/components/settings/store-manager.tsx`.
3. **Current store**: a store chip / switcher at the left of the top-bar actions once the organization has more than one open store (`shared/store-switcher.tsx`). The choice is a cookie checked against `my_work_stores` on every request (`src/lib/store.ts` `getStoreContext`); it decides where new documents go and whose stock they use.
4. **Stock across stores**: the inventory list shows the current store's available stock, its low-stock state (store level or the product's) and the store price, with **Other stores: N** opening a per-store table; stock filters use the current store. The details panel has a **Stock by store** table and store prices. The product dialog's stock field is the current store's ("STOCK ON HAND AT …"); admins get **Store prices & low-stock levels** per store. CSV import / export use the current store's stock. The console Products tab sets stock per store (STOCK AT select). Global search shows "Here: 2 · Other stores: 15".
5. **Documents**: the line search shows stock and price at the document's store plus "Other stores: N" (each store on hover); a short line says "Only 2 here · 15 at Store B"; with selling across stores on, each line has a **From** store select (desktop row and phone edit sheet), saved as `source_store_id`. The header shows the store. Opening another store's document asks to **Switch to that store** (members of it) or opens read-only (others). Printouts, the slip and the share page name the store and use its address, phone and tax numbers when set.
6. **Lists, dashboard, reports, alerts**: drafts / quotations / invoices lists, the dashboard figures and reports show the current store, with **This store | All stores** (`shared/store-scope.tsx`, `?store=all`) for admins and members of more than one store; "All stores" lists add a Store column. The bell shows the current store's alerts. Console plan usage counts open stores.

7. **Subscription governs stores and users (Rev 11)**: organization admins add stores and invite / reactivate users only within the subscription's limits (`src/lib/plan-limits-data.ts` `getPlanLimits`; the database refuses more). Settings → Stores and Team show "the subscription includes N" and, at the limit, hide the add button with a note to use Subscription → Request a Plan Change; the console shows the same note pointing to its Subscription tab. Deleting stores and switching them off / on is console-only (`deleteStore` and the Open switch need the console).
8. **Settings layout fixes**: the Settings and console tab bars stay on one row at every width (`useTabBar`: tighter tabs, then no icons, then short labels, then sideways scroll). **Printing** and **POS** became one tab, **Tax & Printing** (`/settings/printing`; `/settings/pos` redirects), named the same in the console. Cards on Stores, Customers and the Subscription tab have their gaps, the add buttons sit at the card's right edge, and Subscription's left column always shows the billing dates ("Nothing to pay" / "Not billed" on a free plan). **One date format, "09 Nov 2026"**, everywhere: `formatDay` / `formatDate` / `formatDateTime` in `src/lib/format.ts` (two-digit day, "Sep" not "Sept"), used by documents, lists, the console, subscriptions, charts and the dashboard clock; date fields (`shared/date-input.tsx`) read the same in any browser language (the browser's own date input showed 11/09/2026 in English (US)). **One dropdown style**: every `<select>` gets the same border, chevron, focus ring and light/dark colours from `globals.css`; Chrome / Edge 135+ also open a styled list (rounded, shadowed, highlighted choice with a check). The Invoices / dashboard / reports **This store | All stores** toggle is a bordered segmented control in its own bar.
9. **A saved invoice's customer and due date** (owner, 2026-10-25): its customer can never be removed: the × becomes **Change**, which searches for another customer while the current one stays until a new one is picked ("Keep current" cancels); anyone who can edit the invoice may swap it. Its **due date** can be changed only by organization admins (and the console): staff see it read-only, and swapping the customer leaves it as it was (for admins it follows the new customer's credit days). Enforced by the trigger `quotes_guard_invoice_facts` (migrations `20261025133202_phase20_invoice_facts`, then `20261025135431_phase20_invoice_due_date`, which narrowed it to the due date; applied 2026-10-25; rolled-back check: staff can swap the customer and walk-in name, removing the customer is refused (not null), staff are refused on the due date and can still save other changes, admin and console can change the due date).

**Not built / changed from the plan**: the stock ledger has no screen yet (Phase 24, as planned); "Request transfer" from a short line is Phase 24. On phones the inventory card shows this store's figure and the per-store table is in the product details (tap the card) rather than a separate bottom sheet. Sorting the inventory by stock uses organization totals. Console Create Organization and Create User don't pick stores yet: every organization starts with Main Store and new members get it; more stores and access are set on the Stores tab.

---

### PHASE 21 (Version 2): Product Variants, Kits & Image Gallery [COMPLETED]
**Commit**: `Phase 21 - product variants, kits and image gallery`. Plan: `docs/upgrade-plan.md` Phase 21 (deliverables 1–8, RF-21.1, RF-21.2, Rev 14). Migrations applied to the live database 2026-10-26; existing products, stock and documents unchanged. Rolled-back database checks passed (variants and price changes, switching variants off, kits reserving / deducting / refusing / giving back their products, kit cost, barcode scans, image table and storage folder rules).

**What was built**:
1. **Migrations** (10 files, applied 2026-10-26):
   - `20261026062158_phase21_variants_kits_schema`: `product_groups` (name unique per organization, SKU prefix, category, unit, cost, price, low-stock level, tax-inclusive flag, fitment flag, attributes, archive), `product_option_types` (up to 3 per group, in order) and `product_option_values` (value, order, `price_delta`); on `inventory_items`: `group_id`, `option_values` (value ids in option order), `variant_label` ("Red / L"), `own_price`, `own_cost`, `is_archived`, `barcode` (unique per organization with pack barcodes), `is_kit`; `kit_components` (kit, component, quantity in the component's unit, order); `quote_items.variant_label` and `kit_components` snapshots.
   - `20261026063021_phase21_variants_kits_functions`: the product limit counts variants and kits but not archived variants (and checks again when one comes back); barcodes are checked against products and packs; a kit can't have packs, contain a kit, an archived product or more than 30 products; a kit's cost is the sum of its products' costs, kept up to date when they change; `kit_available(kit, store)` (whole kits the products make); `apply_stock` refuses kits; `quote_items_sync_stock` snapshots a kit line's products and reserves / deducts / releases each one at the line's store (ledger note "Kit: <name>"), checking all of them first; `search_inventory_items` and `inventory_items_at_store` skip archived variants and match a product barcode exactly; `inventory_list(store, grouped, query)` (a group is one row with its price range, total stock and variant count, or every SKU); `save_product_group` (the group, its options, values and variants in one transaction; stock through `set_item_stock`); `delete_product_group` (deleted, or archived when a variant is on documents); `private.retire_variant` (a variant with stock or in a kit can't be switched off; one with history is archived, otherwise deleted).
   - `…_phase21_drop_old_save_item`, `…_phase21_save_inventory_item`: `save_inventory_item(p_barcode, p_is_kit, p_kit_components)`; variants are refused there ("change it in its product group"); kits get no stock or packs; a product with stock or documents can't become a kit and back. `admin_near_limits` and `admin_reconcile_tenant` updated (kit lines reconcile through their snapshot).
   - `…_phase21_stock_reports`: dashboard, reports and bell alerts leave out kits and archived variants. `…_phase21_product_images`: `product_images` (product or group, path, url, order; at most 8; none on variants; members may change only the order), public bucket `product-images` (1 MB, PNG / JPEG, write and delete only in the organization's own folder), `tenants.images_on_drafts`, `images_on_quotations`, `images_on_invoices` (off by default). `…_phase21_switch_off_after_stock` (stock entered with a variant that's being switched off is set first), `20261026071226_phase21_kits_never_low` (kits never count as low stock), `20261026072926_phase21_images_on_pdf` and `20261026133336_phase21_images_on_share` (`tenants.images_on_pdf`, `images_on_share`, both on by default).
2. **Products with variants**: **Add New Product** is a menu: Product, Product with variants, Kit. The variant dialog (`inventory/product-group-dialog.tsx`, wide) holds the group details (name, SKU prefix, category, attributes, unit, cost, price, low-stock level, tax flag, fitment, images), **Options** (up to 3; values typed one by one or "S, M, L"; each value can change the price, e.g. +200 for XL) and the **Variants** matrix: every combination with its SKU (made from the prefix and the values, editable), barcode, own price and cost (empty = the group's plus price changes), low-stock level, stock at the current store and an on / off switch. **Bulk edit**: tick variants, then set price, cost, low-stock level or stock together, or switch them on / off. Options are fixed once a group has variants (names and values can still change; new values add combinations, switched on). A combination that was switched off before starts off.
3. **Inventory list**: **Grouped | All SKUs** (`?view=flat`). A group row shows its image, "N variants · Size × Colour", price and cost ranges, total available stock and how many variants are low; the arrow opens its variants (SKU, barcode, prices, stock per variant). Editing a variant opens its group (loaded on demand in the All SKUs view); variants are switched off in the group rather than deleted. Deleting a group deletes or archives its variants (refused while one has stock). Phone cards expand the same way.
4. **Kits (RF-21.1)**: the kit dialog is the product dialog in kit mode: no stock, low-stock or packs; **Products in this kit** searches products (variants included, kits not) and sets how many of each go in one kit, showing how many kits each product's stock covers; the cost is read-only (worked out on save). Lists, details, line search and global search show kits available at the current store; the details panel lists the kit's products. Document lines with a kit reserve / deduct its products and show "Includes: 2 × Clip, 1 × Cable" on the PDF, share page and slip, from the snapshot saved with the line.
5. **Image gallery (RF-21.2)**: products, kits and groups get up to 8 images in their dialog (PNG / JPEG resized in the browser to a 1200px JPEG and a 240px thumbnail, `src/lib/image-resize.ts`; drag or arrows to reorder; the first is the main image). Changes upload after the product is saved (`POST /api/product-images`, checked server-side; `removeProductImages`, `orderProductImages`); deleting a product removes its files. Thumbnails show in the inventory list, line search, option picker and details panel (with a larger view). Variants use their group's images. **Settings → Tax & Printing → Product images on documents** has a switch each for estimates, quotations and invoices, plus **On the A4 PDF** and **On the customer link** (owner requests 2026-10-26; the console's Tax & Printing tab too). Where a document's switch is on, each line's thumbnail shows on its A4 PDF and / or its share page, as those two switches say (the POS slip never does). The customer link is not a shop: a photo is a 44px thumbnail beside the line with nothing behind it (no link, product page or larger view; long-press, right-click and drag do nothing). The two "where" switches only appear once a document's switch is on. Fixes from the owner's test (2026-10-29): the A4 PDF's logo is left-aligned with the shop name, and its discount line reads "Discount 25%" (just "Discount" for a fixed amount); the discount reason stays inside the app.
6. **Barcodes**: one per product, variant or kit (packs keep theirs). Scanning it in line search adds that exact product or variant.
7. **Line search and the option picker**: products with variants appear once ("6 variants", price range, available stock); picking one opens the **option picker** (`inventory/option-picker.tsx`): a row of buttons per option, each showing the stock of the variants it leaves given the other choices (values not sold are crossed out); options with one value are chosen already; **Add** puts the variant on the document. The phone search sheet works the same way. Variant lines show "Red / L"; kit lines a Kit chip with its contents on hover.
8. **CSV**: new columns **Barcode**, **Kit Components** (`CLIP-01=2; CABLE-3=1`), **Group** and **Option 1–3 Name / Value**. Rows with the same Group are one product's variants (the group's details from its first row, stock per row; variants already in the group that the file doesn't list are kept); a product a kit uses can be added earlier in the same file. Import keeps a group's rows in one call. Export writes every column, so a catalog round-trips. The import also fills the new product fields (it would otherwise have failed validation).
9. **Elsewhere**: the console's Products tab badges kits and variants and sends them to the shop (Login As) for editing; plan usage, near-limit and category counts leave out archived variants; documents show what a kit line could use at its store, counting what it already holds.

**Not built / changed from the plan**: variants have no packs or store prices of their own (packs are refused for variants; store prices stay per product); images are per product or group, not per variant; the matrix sets stock at the current store only (other stores: switch store); a kit's organization-wide availability uses each product's totals (per-store figures are exact); tax category on groups moves to Phase 26 (Rev 14). Archived variants have no screen; they come back when their combination is switched on again.

---

---

## 8. ROADMAP: STILL TO BUILD

> Version 1 blueprint: nothing left (Phases 12–15 moved to §7 on 2026-10-19). Version 2: Phases 16–21 are done (see §7); Phases 22–33 are planned in `docs/upgrade-plan.md` and are built one at a time; each moves to §7 when done. Left from Phase 17 (see its "Not built" note): document overrides, platform default lists and console imports (with the phases that add those features), and Login As permission bypass (Phase 22). Left from Phase 18 (see its "Not built" note): a console notification bell for category requests, and marking an organization's own subcategories archived when their catalog parent is archived. Left from Phase 19 (see its "Not built" note): purchase units on purchase orders / goods receiving (Phase 25), tags on statements and price lists (Phases 30, 26), packs in the console Products tab. Left from Phase 21 (see its "Not built" note): packs and store prices for variants, per-variant images, the matrix setting other stores' stock, tax category on product groups (Phase 26). Phase 22 also switches organization users to username + password sign-in with passwords set by the org admin, no invitation emails (upgrade-plan Rev 12, deliverable 6). New work starts as a new phase here, listing only what doesn't exist yet and naming the §7 phase it extends.

---


## 9. SUMMARY FOR THE DEVELOPER & AI AGENTS

This specification represents the **single source of truth** for this codebase. Any AI agent (Claude Code, Antigravity) reading this file must:
- Respect the **Strict Scope** (No online payment gateways, no complex warehouse tracking).
- Enforce the **Multi-Tenant RLS Digital Lock** on every tenant query and mutation.
- Use **Server Actions with `requireSuperadmin()`** and `createAdminClient()` for all platform administration operations.
- Ensure **all UI features are fully responsive** across Mobile, Tablet, Laptop, Desktop, and Ultrawide displays with zero horizontal window scrolling.
- Follow the **Sequential Phases** with strict pause-and-checkpoint verification after each phase.


