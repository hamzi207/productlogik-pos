<p align="center">
  <img src="public/brand/mark.svg" alt="ProductLogik" width="96" height="96" />
</p>

# ProductLogik POS

A multi-tenant **inventory, invoicing and billing** app for retail and wholesale businesses: stock tracking, quotations, invoices, payments, statements of account, A4 PDFs and 80mm POS slips. Shops in any trade can use it. Automotive fitment (Year/Make/Model) is available as an optional product attribute.

Each organization is its own tenant. Row-level security in Postgres keeps every organization's products, customers and documents separate.

- **Version 1** (CarShop.Pk POS, Phases 1–15) is tagged [`v1.0.0`](../../tree/v1.0.0).
- **Version 2** (ProductLogik POS, Phases 16 onwards) is being built per [`docs/upgrade-plan.md`](docs/upgrade-plan.md).
- What exists today, phase by phase, is recorded in [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) §7.

## Features

- **Inventory**: products with categories, SKUs, cost/sell prices and margins, low-stock alerts, CSV import/export, optional vehicle fitment.
- **Documents**: drafts → quotations → invoices in one click, partial payments, quick cash, configurable numbering.
- **Output**: A4 PDF and 80mm thermal slip (with Urdu/Arabic text support), public share links with QR codes, emails via Resend.
- **Customers**: directory with WhatsApp links, Pakistan localization (Rs./PKR, PKT, local phone and NTN formats).
- **Dashboard and reports**: sales, payments and stock metrics with charts.
- **Team and settings**: staff invites and roles, business profile with logo and brand accent colour, bank details.
- **Superadmin control plane** (`/admin`): organizations, users, impersonation, suspension.
- **Light and dark mode**, installable as a PWA on phones and tablets, layouts for phone through 4K.

## Tech stack

- **Next.js 16** (App Router, Cache Components, React 19, TypeScript)
- **Supabase**: Postgres, Auth, Storage, Row Level Security
- **Tailwind CSS 4** + **shadcn/ui** (Radix) components, `next-themes`
- **react-hook-form** + **zod** for forms and validation
- **@react-pdf/renderer** for PDFs, **Resend** for email

## Getting started

**Prerequisites:** Node.js 22 (see `.nvmrc`) and access to the Supabase project (`sgdbhdmsvfmqxlpkrgez`).

```bash
git clone https://github.com/hamzi207/productlogik-pos.git
cd productlogik-pos
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable | Where to find it | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (publishable key) | Browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys (secret) | Server-only admin features and scripts |
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler | `db:push` / `db:types` only |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally | Auth redirects, share links, emails |
| `RESEND_API_KEY` | Resend → API Keys | Transactional email |
| `RESEND_FROM_EMAIL` | A sender on a domain verified in Resend | Transactional email |

`.env.local` is git-ignored. Never commit real keys.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run check:contrast` | Check the light and dark colour tokens against WCAG AA |
| `npm run db:push` | Apply `supabase/migrations/` to the database (needs `SUPABASE_DB_URL`) |
| `npm run db:types` | Regenerate `src/lib/types/database.types.ts` from the live schema |
| `npm run seed:vehicles` | Load Year/Make/Model data from NHTSA into `vehicles` (safe to re-run; `-- --dry-run` previews) |
| `npm run seed:vehicles:pk` | Load the Pakistan-market vehicle catalog |

The database can also be managed through the Supabase MCP server configured in `.mcp.json`. See [`docs/supabase-mcp-setup.md`](docs/supabase-mcp-setup.md).

## Project layout

```
productlogik-pos/
├── src/
│   ├── app/
│   │   ├── (auth)/           login & register
│   │   ├── (dashboard)/      signed-in app: dashboard, inventory, customers, drafts,
│   │   │                     quotations, invoices, reports, settings
│   │   ├── admin/            superadmin control plane
│   │   ├── share/[token]/    public document share page
│   │   ├── api/              route handlers (documents, search, vehicles, …)
│   │   └── manifest.ts       PWA manifest
│   ├── assets/fonts/         PDF fonts (Noto Sans Arabic, OFL)
│   ├── components/           feature components + shadcn/ui primitives in ui/
│   ├── lib/
│   │   ├── actions/          server actions
│   │   ├── email/            Resend templates
│   │   ├── supabase/         browser / server / middleware clients
│   │   ├── types/            database types
│   │   └── validations/      zod schemas
│   └── proxy.ts              session refresh + route protection
├── supabase/migrations/      schema, RLS, functions (names match the remote history)
├── scripts/                  db helper, contrast check, vehicle seeds
├── public/brand/             ProductLogik mark (SVG/PNG)
├── docs/                     spec, upgrade plan, regression checklist, setup guides
└── design/figma-ui/          Figma UI export (visual reference only, not built)
```

Root-level config files (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`, `.mcp.json`, `AGENTS.md`, `skills-lock.json`) must stay at the root, because the tools only look for them there.

## Testing

Before each release, run through [`docs/regression-checklist.md`](docs/regression-checklist.md). It grows with every phase.

## License

See [`LICENSE`](LICENSE).
