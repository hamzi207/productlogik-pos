Phase 1: 

The Supabase database is set up for Phase 1. I applied all three migrations through the MCP connection, so you didn't have to run any SQL yourself. Type-checking and npm run 
  build both pass.

  What's in the database now:
  - Tables: all 8 exist, and every one has row-level security (RLS, the rules that keep each shop's data separate) turned on.
  - Policies: 23 on the app tables and 4 on file storage.
  - Functions: current_tenant_id, handle_new_shop_registration and process_quote_payment are in place.
  - Sign-up trigger: creating an account also creates the shop and makes that person its admin.
  - Logo storage: the shop-assets bucket exists.

  Code changes:
  - I replaced src/lib/types/database.types.ts with types generated from the live database.
  - The generated types list columns like role as plain text, so I added a one-line fix in src/lib/auth.ts. Any role other than admin is treated as staff.

  One security warning you should decide on: Supabase's security check flags public.rls_auto_enable(), which anyone can call without signing in. It's one of Supabase's own      
  functions, not part of our migrations, so I left it alone. If you want, I can remove that public access. The check also lists our two functions; that's intended, because      
  signed-in users need to call them.

  Please test Phase 1 in the browser:
  1. Run npm run dev and open http://localhost:3000/register.
  2. Register with a shop name, your name, an email and a password. If email confirmation is on in Supabase, click the link in the email.
  3. You should land on /dashboard with your shop name and "admin" showing.
  4. Sign out, then sign back in at /login. You should reach the dashboard again.
  5. In the Supabase dashboard, open Table Editor: tenants and profiles should each have one new row, with role = admin.
  6. Optional: register a second shop in a private window. Each account should see only its own shop.

  I'm stopping here. Once the test passes and you've committed, tell me and I'll start Phase 2.

  Also, claude --resume is a terminal command; typed into this chat it does nothing. This session already picked up where we left off.

  Phase 2: 

  Phase 2 is built, but the vehicle catalog is still empty: you need to run the seed script once to load it. The new database change is already live in
  Supabase. The type-check, lint and build pass, and a dry run of the seed pulled clean data from NHTSA. The Phase 1 fixes are committed (c1eeee0); the
  Phase 2 work is not committed yet.

  What's new:
  - Seed script (scripts/seed-vehicles.mts, run with npm run seed:vehicles): loads Year → Make → Model data for the top 20 makes, model years 2015–2026,
    into the vehicles table.
  - Lookup endpoint (/api/vehicles): feeds the cascading dropdowns that later phases use. It only answers signed-in users.
  - Vehicle types (src/lib/types/vehicle.ts), plus a new database migration (vehicle_lookups).

  Where I changed the spec's version, and why:
  - Junk results: NHTSA matches make names partially. The spec's script would have stored 40+ unrelated manufacturers under "Ram" (Rambler, trailer
    builders) and Honda motorcycles under Honda. The script now only takes cars, trucks and SUVs/minivans, and only exact make names.
  - Duplicates on re-run: the spec's script would have added duplicate rows every time it ran. I fixed the unique constraint so it's safe to run again.
  - Years: 2015–2026, as the spec's text says; its code sample only started at 2018.
  - Running it: it uses Node's built-in TypeScript support instead of ts-node/dotenv, so nothing new to install.

  Your test steps:
  1. Run npm run seed:vehicles. It takes about 2–4 minutes and prints one line per make and year, then a total. The total should be a few thousand
     vehicles, with no ✗ lines. If any fail, run it again; it only fills in what's missing.
  2. In Supabase, open Table Editor → vehicles. It should show clean rows like 2023 | TOYOTA | Camry.
  3. With npm run dev running and you signed in, open these in the browser:
     - http://localhost:3000/api/vehicles should list the years.
     - http://localhost:3000/api/vehicles?year=2023 should list the makes for that year.
     - http://localhost:3000/api/vehicles?year=2023&make=toyota should list Toyota models, each with an id.
  4. In a private window where you're not signed in, open /api/vehicles. You should be redirected to the login page, not shown any data.
  5. If everything checks out, commit with: git add . && git commit -m "feat: phase 2 - nhtsa vehicle engine and seed pipeline"

  Two security warnings, your call whenever you like:
  - Supabase's own rls_auto_enable() function can still be called without signing in (from earlier).
  - New: Supabase Auth's leaked-password check is off. It blocks passwords that appear in known data breaches. You turn it on in Authentication →
    Settings (it may require a paid Supabase plan).

  I'm stopping here. Tell me when Phase 2 passes and is committed, and I'll start Phase 3 (inventory).

  Follow-up during testing: the models list came back empty because the seed hadn't been run yet. I ran it (3,255 vehicles, no failures) and changed
  the endpoint so empty answers are never cached by the browser. The empty answer from before the seed stayed cached for that one URL until the cache
  expired or was cleared.

  Phase 3: 

  Phase 3 is built: the Inventory page is live in the sidebar. You can add, edit and delete parts, mark each as Universal Fit or tied to specific vehicles, and
  see margins and low-stock warnings. Type-checking, lint and the production build pass. I also loaded the page as a temporary test shop: it showed the right
  items for each search and filter, highlighted low stock, and showed nothing from your shop. I've deleted that test shop. I haven't clicked through the        
  add/edit form myself, which is what your test below covers. Nothing from this phase is committed yet.

  What's on the page:
  - Table: each part shows its name, SKU, category, fitment, cost, selling price, a colour-coded margin and stock level. Rows at or below their own alert level
    (default 5) are highlighted.
  - Filters: search by SKU or name, category buttons, and a fitment-type dropdown. Filters are kept in the URL, so a refresh or a shared link keeps them.       
  - Add / Edit dialog:
    - SKUs can be generated from the category; SKUs are always saved in capitals.
    - A live margin preview shows as you type prices.
    - The Universal Fit / Vehicle Specific choice follows the Figma design.
    - Vehicle selection is Year → Make → Model. Each model you pick becomes a removable tag. If you change the year, the make stays selected, so adding the same
      model across several years only takes two clicks each.
  - Delete: asks for confirmation first. Past quotes keep their line descriptions and prices.

  Changes behind the scenes:
  - Saving is all-or-nothing: an item and its vehicle links save together in one database transaction, so a half-finished save can't leave an item with no      
    vehicles.
  - Search handles symbols: searching for 20% or 6.5" matches those characters literally. I tested this against the live database.
  - Migration file names: I renamed the local migration files to match the version numbers Supabase recorded. Without this, npm run db:push would have tried to 
    re-run everything.

  Limits for now: there's no pagination yet, and the database API returns at most 1,000 rows. That's fine for most shops, and I can add paging later. Any shop  
  member can manage inventory, since the spec doesn't restrict it to admins.

  Your test steps:
  1. Open /inventory (sidebar → Inventory). You should see the empty state.
  2. Add a Universal part, e.g. "Standard Window Cleaner", category Hardware / Chemicals. Try Generate for the SKU.
  3. Add a Vehicle Specific part, e.g. "Ford F-150 Pre-cut Ceramic Tint". Choose 2022 → Ford → F-150, then switch the year to 2021 and pick F-150 again. Give it
     a stock of 3 so it shows as low stock.
  4. Check the table: green "Universal Fit" and blue "Vehicle Specific (2 vehicles)" tags (hover the blue one for the list), margin percentages, and a red      
     low-stock badge on the tint.
  5. Try the search box, the category buttons and the fitment filter. Then edit an item, and delete one.
  6. Optional: try saving a duplicate SKU (you should get an error on the SKU field), or Vehicle Specific with no vehicles (you should be blocked).
  7. Commit: git add . && git commit -m "feat: phase 3 - inventory management and ymm compatibility"

  The two security warnings from earlier, rls_auto_enable() and leaked-password protection, are still waiting on your decision.

  Tell me when Phase 3 passes and is committed, and I'll start Phase 4 (customers and WhatsApp CRM).

  Phase 4:

  Phase 4 is built and ready for you to test in the browser; nothing is committed yet. Type-checking, lint and the production build all pass. Every new
  page was loaded with a temporary test shop (since deleted) and rendered correctly.

  Pakistan defaults (spec §2.3):
  - Currency: the shop switched from $ to Rs.; only Rs. or PKR are allowed. Amounts show as Rs. 12,500.00, or whole rupees if paisa is turned off.
  - Timezone: dates use Pakistan time (Asia/Karachi).
  - Phone numbers: typed the Pakistani way (0300-1234567, 0300 123 4567, +92 300 1234567 and 3001234567 all work). Landlines like 051-1234567 are
    fine for "other phone", but WhatsApp numbers must be mobiles starting 03. + international numbers are rejected until switched on in Settings.
    Numbers are saved in one standard format so WhatsApp links work, and always display as 0300-1234567.

  Settings page (sidebar → Settings; admins edit, staff view only): currency (Rs./PKR), show paisa with a live preview, tax rate (starts at 0%),
  "selling prices include tax" (on by default), allow international numbers, and timezone (shown, fixed for now).

  Tax-inclusive products: each product has a "Selling price includes tax" checkbox defaulting to the shop setting. The inventory table shows
  "incl. tax" or "+ tax" under each price. Quotes in Phase 5 will work tax out of the price instead of adding it on top.

  Customers (sidebar → Customers):
  - List: totals (customers, B2B accounts, outstanding balance), type badges, clickable WhatsApp numbers, quote count / outstanding per customer.
  - Search covers name, contact, phone (either format), email and NTN. Type filters: Dealerships, Fleet, Retail.
  - Register / edit in a pop-up, with an NTN / Tax ID field.
  - Profile page: contact details, notes, a "Message on WhatsApp" button with a greeting pre-filled, and a quote history that fills in from Phase 5.
  - Delete is blocked once a customer has quotes, so their history is kept.

  Drafts / Quotations / Invoices (requested for Phase 5): the sidebar shows Drafts, Quotations and Invoices as "coming soon" instead of
  "Quotes & POS". The spec's Phase 5 now says: one document at different stages; conversions Draft → Quotation or Invoice, Quotation → Invoice;
  number series D-1001 / Q-1001 / INV-1001, with earlier numbers kept ("INV-1007, from Q-1004"); direct billing from Invoices for walk-in sales.

  Also fixed: the customer profile page (the first page with an ID in its address) broke the production build because the sidebar couldn't work
  out the current page at build time. Fixed the way the Next.js docs recommend (sidebar nav wrapped in Suspense).

  Your test steps:
  1. Settings: check Rs. is selected. Switch to PKR and turn paisa off; watch the preview. Save, check prices on /inventory, then switch back.
  2. Inventory: edit a product; check the new tax checkbox and the Rs. prefix on the price fields.
  3. Customers: register "Precision Auto Dealership" with WhatsApp 0300 123 4567. It should save and display as 0300-1234567.
  4. Phone rules: WhatsApp +971501234567 should be rejected with a hint about Settings; turn on international numbers and it saves.
     A landline like 051-1234567 is rejected as WhatsApp but accepted as "other phone".
  5. Search 0300-123 or the contact's name. Open the profile and click Message on WhatsApp.
  6. Commit: git add . && git commit -m "feat: phase 4 - b2b customer directory and pakistan localization"

  Still waiting on a decision: rls_auto_enable() can be called without signing in, and leaked-password protection is off.

  Phase 4 tweaks (committed as "Phase 4 Tweaks"):

  - Settings: the shop timezone can be changed (any timezone, grouped by region with its UTC offset). The database only accepts real timezone names.
  - Dashboard clock at the right end of the Overview heading, in the shop timezone, with the day, date and timezone under it.
    Settings → Dashboard clock: show/hide, digital or analog, and 12-hour or 24-hour for the digital clock. The analog clock has a second hand; the
    digital one shows hours and minutes only.

  Phase 5:

  Phase 5 is built: Drafts, Quotations and Invoices are live in the sidebar. Type-checking, lint and the production build pass. I also ran a full
  browser test as a temporary test shop (24 checks, all passed, no browser errors) and deleted that test shop afterwards. Your shop's data was not
  touched. Nothing is committed yet.

  How it works:
  - One document moves through the stages: Draft (D-1001) → Quotation (Q-1001) → Invoice (INV-1001). It keeps every number it has had, so an invoice
    shows "from Q-1001 · D-1001" and old links redirect to where the document is now. Numbers run per shop and start at 1001.
  - Conversions are one click with a confirmation: Draft → Quotation, Draft → Invoice, Quotation → Invoice. Invoices can't be turned back.
  - Drafts can be deleted. Quotations can be marked accepted, cancelled, or re-opened. Unpaid invoices can still be edited; paid ones (Phase 6) and
    cancelled quotations are read-only.
  - "New" buttons on each page. New Invoice is direct billing for walk-in sales. A customer's profile has a "New Quotation" button that pre-selects
    them, and their history links to each document.

  The builder:
  - Customer search (name, phone or NTN), with "Register a new customer" in a pop-up.
  - Year → Make → Model vehicle picker (optional for parts-only sales) plus a trim/package notes box.
  - Magic Fit: with a vehicle chosen, the parts list shows only universal parts and parts linked to that vehicle, and the banner says how many fit.
    Switch off "Compatible parts only" to see everything; parts that aren't linked are labelled.
  - Line items: quantity stepper, editable unit price, move up/down, remove, and a warning when the quantity is more than the stock. Adding the same
    part again adds 1 to its quantity. Optional fitting / labour lines with their own description, hours and rate.
  - Order summary: subtotal, discount in Rs. or %, tax, grand total, internal notes and your quote terms.
  - Tax follows your settings. Tax-inclusive prices have the tax worked out of them; tax-exclusive prices have it added on top. The final totals are
    calculated in the database, so they can't be tampered with from the browser.

  Fixed during testing: Next.js keeps visited pages alive in the background, so "New Draft" could reopen the form you had just saved and create a
  duplicate. The form now resets after each create.

  Your test steps:
  1. Customers: add a customer if you deleted your test one.
  2. Drafts → New Draft: pick the customer, then a vehicle that some of your parts are linked to. Check that the list hides parts for other vehicles
     but still shows universal ones. Turn "Compatible parts only" off and on.
  3. Add two parts and a labour line, set a 10% discount, and check the totals. (Set a tax rate in Settings first if you want to see tax.)
  4. Save Draft (D-1001), then Convert to Quotation (Q-1001), Mark Accepted, then Convert to Invoice (INV-1001, "from Q-1001 · D-1001").
  5. Invoices → New Invoice: bill a walk-in sale with no vehicle.
  6. Open the customer's profile: the history lists both invoices and links to them.
  7. Commit: git add . && git commit -m "feat: phase 5 - drafts, quotations, invoices and ymm magic filter"

  Still waiting on a decision: rls_auto_enable() can be called without signing in, and leaked-password protection is off. Before Phase 6:
  signed-in users can still change a quote's payment fields directly through the database API, so Phase 6 should lock "paid" down to the payment
  procedure only.

  Changes from docs/changes.md (after Phase 5):

  Phase 5 was committed on its own first (cd9a9e4). These changes are built and tested but not committed. Type-checking, lint and the
  production build pass. A browser test as a temporary test shop passed all 25 checks with no browser errors; the test shop was deleted.
  The database logic was also tested directly against your shop inside a transaction that was rolled back, so your data is unchanged.

  Your choices: keep tax-inclusive prices alongside the new tax order; leave the Purchases widget and Total Suppliers out (no purchase
  records yet); apply a customer's default discount as the document discount.

  1. Sidebar: Overview, Invoices, Quotations, Drafts, Customers, Inventory.

  2. Customers and walk-in sales:
  - Every shop has a "Walk-in / Cash Customer" (new shops get it on sign-up). A "Walk-in / Cash" button on every document picks it, with
    optional buyer name and phone stored on the document only. It is hidden from the customer directory and can't be edited or deleted.
  - "Save details to customer directory for future use" opens the full customer form with the name and phone filled in; the new profile then
    replaces the walk-in on that document.
  - Customers have a default discount %. Picking them on a document fills in the document discount with the reason
    "Customer default discount (50%)". You can change it.

  3. Pricing: each line has a discount in % or Rs. Order: line nets → subtotal → document discount (reason required) → taxable amount →
     sales tax → grand total. Tax-inclusive prices still have tax worked out of them; with tax-exclusive prices the tax is exactly
     (subtotal − discount) × rate.

  4. Tax identity: "NTN / Tax ID" is now "CNIC / NTN", checked and stored as 12345-1234567-1 or 1234567-8. New fields: sales tax registration
     (registered / not) and STRN. Dealerships and fleet accounts need a CNIC or NTN; registered customers also need an STRN. The database
     enforces the same rules.

  5. Stock reservations:
  - Drafts hold nothing. Quotations reserve their parts. Invoices deduct stock (direct, or from a quotation, which releases its reservation).
  - Cancelling, deleting or moving a quotation back to drafts releases the reservation. A quotation moved back to drafts gets its Q- number
    back when re-issued.
  - Nothing can sell or reserve more than is available (on hand − reserved), and on-hand stock can't be set below what is reserved.
  - Quotations are valid for 2 days by default (Settings → Quotations). Expired ones are marked but keep their stock reserved until you act.
  - Change from the original plan: stock is deducted when the invoice is issued, not when it is paid. Phase 6's "mark as paid" no longer
    touches stock (spec updated).
  - Inventory shows available, on hand and reserved for each part. The quote picker shows available stock.

  6. Vendors: each part has an optional vendor / supplier name. It is not shown in the inventory table; click a product's name to see its
     details, including the vendor.

  7. Dashboard: a Business overview with Sales, Profit (sales excluding tax minus parts cost), Pending invoices and Pending quotations
     (unexpired), each for today, this week, this month, this year and all time, in your shop's timezone. Plus counts of customers, products,
     quotations and invoices. "Customize" shows or hides each widget and period, saved per user.

  Your test steps:
  1. Check the sidebar order and the Business overview on the dashboard. Use Customize to hide something, reload, and check it stays hidden.
  2. Inventory: click a part's name and check the details (add a vendor via Edit first).
  3. Customers: edit or register a dealership; try saving without a CNIC/NTN (refused), then with one. Set a default discount of 50%.
  4. Quotations → New Quotation: pick that customer (50% fills in with a reason). Add a part with a 10% line discount and check the totals.
     Save it, then check Inventory shows those units as reserved.
  5. Invoices → New Invoice → Walk-in / Cash: try to sell the reserved units (refused), then sell something else.
  6. Open the quotation: Move to Drafts (stock released), Convert to Quotation (same Q number), Convert to Invoice (stock deducted).
  7. Commit: git add . && git commit -m "feat: walk-in sales, discounts, tax IDs, stock reservations, vendors and dashboard metrics"

  Still open: rls_auto_enable() can be called without signing in, and leaked-password protection is off. Before Phase 6 ships, clients must
  be stopped from setting an invoice to "paid" directly through the API.

  Changes from docs/changes.md, round 2 (same phase, still not committed):

  Type-checking, lint and the production build pass. Browser tests as a temporary test shop passed 28 checks (22 for this round,
  6 re-checking last round's quotation flows on the new layout) with no browser errors; the test shop was deleted. One bug was found and
  fixed during testing: saving failed because Supabase's API rejects an UPDATE without a WHERE clause inside save_quote.

  Documents (drafts, quotations, invoices):
  - New layout, like SOS Inventory: a header with the customer and bill-to address on the left and number, dates, due date and status on
    the right; the line items in full width; notes and quote terms bottom-left; totals, payments and balance bottom-right.
  - No more parts catalog, vehicle or trim. A search box in Line items finds parts by name or SKU; click one to add it (again to add 1).
  - Columns: qty, unit price, discount, sale price, line total. The unit price of an inventory part comes from inventory and can't be
    edited (the server enforces this). The discount is per unit, in % or Rs. Changing the discount changes the sale price; typing a sale
    price turns the discount into a flat Rs. amount. Line total = qty × sale price.
  - Items not in inventory: "Custom item" (or pick "Add ... as a custom item" in the search). You type the description and price; it
    doesn't touch stock.
  - Quote terms show on drafts and quotations only, not on invoices.

  Invoices:
  - Statuses: Pending / Unpaid, Partially Paid, Due (unpaid past the due date), Paid, Cancelled. The Invoices list has a filter for each,
    plus Due date and Balance columns.
  - Each invoice has a due date (default: invoice date + 7 days, change it in Settings → Quotations & invoices, or per invoice).
  - Record Payment: amount (part payments are fine), cash / card / bank transfer / cheque, date, reference. Paid in full = Paid.
  - Mark Unpaid removes the payments. Unpaid invoices can be cancelled (stock goes back) or deleted (stock goes back). Paid invoices must
    be marked unpaid first.

  Elsewhere: product names are bigger (13px) everywhere; the sidebar order is Overview, Inventory, Invoices, Quotations, Drafts, Customers.

  Your test steps:
  1. Invoices → New Invoice: pick a customer (their address shows under Bill to). Search a part and click it; try a 10% discount and watch
     the sale price; then type a sale price and watch the discount switch to Rs. Add a custom item with a price.
  2. Create Invoice. Record a part payment (Partially Paid), then the rest (Paid). Mark Unpaid, then Delete: the stock comes back.
  3. Make another invoice and Cancel it: the stock comes back and it shows as Cancelled.
  4. Change an unpaid invoice's due date to yesterday and save: it shows as Due, and the Due filter finds it.
  5. Quotations → New Quotation: Quote terms show at the bottom; on invoices they don't.
  6. Commit: git add . && git commit -m "feat: document layout, line pricing, custom items, payments and invoice statuses"

  Still open: rls_auto_enable() can be called without signing in, and leaked-password protection is off.

  Changes from docs/changes.md, round 3 (same phase, still not committed):

  Type-checking and lint pass. Browser test on your dev server as a temporary test shop: 14 checks passed, no browser errors; the test
  shop was deleted. (No production build was run, so the dev server keeps serving fresh styles.)

  - Invoice number: a new invoice / quotation / draft shows the next number in line (e.g. INV-1002) as soon as it opens. Nothing is
    reserved: if it's never saved, the number stays free for the next one. If someone else saves first, this one gets the next free
    number and the save message says so.
  - Due date: a new invoice starts due on the invoice date. Customers have a Credit period (days) on their profile; picking that customer
    sets the due date to the invoice date + their credit period. You can still change it per invoice. The due date is saved on the
    invoice. Converting a quotation to an invoice uses the customer's credit period too. The shop-wide "due after N days" setting from
    round 2 was removed (the customer's credit period replaces it).
  - Unsaved changes: leaving a draft / quotation / invoice with unsaved changes (the back arrow, the browser Back button, or any link such
    as the sidebar) asks "Save your changes?" with Save, Discard changes or Keep editing. Reload / close tab uses the browser's own
    prompt.
  - Business / Private customer category: skipped, as you asked.
  - Walk-in / cash sales without a name or number: answered below; no change needed.

  Walk-in sales tracking: every walk-in invoice belongs to the shop's "Walk-in / Cash Customer" record, so it counts in Sales, Profit,
  Pending invoices and stock exactly like any other invoice; the name and phone are optional extras on that one invoice. In the
  Invoices list it shows as "Walk-in / Cash Customer" (or the buyer's name if typed).

  Your test steps:
  1. Customers: edit a customer and set Credit period to 30 days.
  2. Invoices → New Invoice: the next invoice number shows at the top right. Due date = today. Pick that customer: due date jumps 30 days
     ahead. Pick Walk-in / Cash: back to today.
  3. Add a part, then click the back arrow (or a sidebar link): you're asked to save or discard. Try Keep editing, then Save Invoice.
  4. Open the invoice, change a discount and press the browser's Back button: same prompt. Discard → the change isn't saved.
  5. Commit: git add . && git commit -m "feat: invoice number preview, customer credit periods, unsaved-changes prompt"

  Changes from docs/changes.md, round 4 (same phase, still not committed):

  Type-checking and lint pass. Browser test on the dev server as a temporary test shop: 12 checks passed, no browser errors; the test
  shop was deleted.

  - Sidebar: more space around the header, shop card, menu items and help card; on short screens it scrolls instead of squashing and the
    help card is hidden.
  - Name: CarShop.Pk POS System everywhere (sidebar logo "C", sign-in/register pages, browser tab titles, help card, version line).
  - Editing a draft / quotation / invoice: "Save Changes" now has a menu (▾) with Save & Close (saves, back to the list) and Save as Copy
    (your edits become a new draft; the original stays as it was saved).
  - Bigger titles: document numbers, customer names, bill-to and summary names are now 13px, the same as product names.
  - Dashboard: Customize lets each card show Numbers, a Bar chart or a Pie chart (counts: numbers or bars).
    Sales / Profit bars = last 6 months; pie = one period split into profit, cost of parts and tax (pick the period on the card).
    Pending invoices bars = unpaid balance by age (not due, 1–30, 31–60, 60+ days overdue); pie = overdue vs not yet due.
    Pending quotations bars / pie = sent vs accepted. Hover any bar or slice for details.
  - Toasts for every save, create, discard and delete (invoices, quotations, drafts, customers, inventory, payments, settings,
    dashboard), each with a line saying what happened, e.g. "Invoice INV-1003 saved — Precision Auto · Rs. 4,650.00. Stock updated to
    match." Failures show a red toast with the reason.

  Your test steps:
  1. Check the sidebar and the CarShop.Pk name; make the window shorter to see it scroll.
  2. Open an invoice, change something, use Save Changes ▾ → Save & Close, then try Save as Copy on another.
  3. Dashboard → Customize: set some cards to Bar chart and Pie chart, Save. Hover the bars; change the period on the Sales pie.
  4. Save a customer, a part and Settings: each shows a toast with details.
  5. Commit: git add . && git commit -m "feat: CarShop.Pk branding, save options, dashboard charts, detailed toasts"

  Round 4 follow-ups:
  - More room at the top: sidebar logo area matches the top bar height (84px, borders line up); more space between logo, shop card and menu;
    page headings sit 36–40px below the top bar. Sidebar menu items and the gaps between page cards are tighter.
  - Customer and inventory pop-ups: closing with unsaved edits (Cancel, X, Escape, clicking outside) asks "Discard changes?"
    (Keep editing / Discard changes); discarding shows a "Changes discarded" toast. Closing without edits is instant.
    Browser test: 7 checks passed.

  changes.md round 5:
  - Dashboard: date range picker beside Customize (Today / This week / This month / This year / All time / Custom from-to),
    kept in the URL (?range=&from=&to=); periods removed from Customize. Cards show the range's headline figure + breakdown;
    bar charts follow the range (by day up to a month, by month up to 2 years, else by year). RPC dashboard_metrics(p_range, p_from, p_to)
    (migration 20261015140000_dashboard_date_range).
  - Count cards reordered: Customers, Products, Invoices, Quotations (Invoices above Pending invoices, etc.).
  - Toasts: fixed light theme (OS dark mode had made them black) + rich colours: success green, error red, info blue, warning amber; white text.
  - Customer profile: four all-time cards above the history (Total invoices, Pending invoices, Total due, Overdue; Overdue turns red);
    WhatsApp / other phone are tel: links, email is a mailto: link.
  - Record Payment: optionally apply a payment to invoice items: tick items (and units) to fill the amount, or type an amount and tick items
    to spread it in order; each item's share editable; the rest is a general payment. Line share = its net total's share of the invoice total
    (incl. tax and invoice discount). Table invoice_payment_items + RPC record_payment; a trigger re-links allocations when an invoice's lines
    are saved again (migration 20261015143000_payment_item_allocations). The payments list shows what each payment was for.
  - Search shortcut hint shows Ctrl K (or ⌘ K on Apple devices).
    Browser test: 31 + 1 checks passed. Known: the invoice page itself is wider than a phone screen (pre-existing).
  - Follow-up: the dashboard date dropdown became a date picker (Radix Popover, no new dependency): button shows the range name + dates;
    panel has shortcuts (Today, Yesterday, This week, Last 7 days, This month, Last 30 days, Last month, This year, All time) and a
    two-month calendar (Monday-first, future days disabled, click start then end, hover preview, Apply/Cancel); one month on phones.
    Browser test: 10 checks passed.
  - Follow-up: Settings → Timezone & week → First day of the week (Monday / Sunday / Saturday; tenants.week_start, ISO 1/7/6,
    migration 20261015160000_tenant_week_start). Drives dashboard "This week" (RPC) and the calendar's first column.
    Date picker made compact (~590×300 on a 1366×768 laptop); phones: one month, 3-column shortcuts, fits 360px. 10 checks passed.

  Branding (logos from carshop_logo/):
  - Sidebar: white CARSHOP wordmark + "POS SYSTEM"; collapsed sidebar shows the round car mark (40px, faint ring).
  - Sign-in/register: white logo on the dark side panel; on phones (panel hidden) the black logo sits above the form.
  - New src/app/favicon.ico (16/32/48, car lines thickened so they read at tab size), src/app/icon.png (512),
    src/app/apple-icon.png (180, black square). Trimmed logos + mark in public/brand/.
    Browser check: 5 checks passed (logos load at the right sizes; icons served).
  - Collapsible sidebar: "Collapse sidebar" row at the bottom of the sidebar toggles html[data-sidebar=collapsed] (icons only, round mark,
    hover labels); remembered per browser in localStorage "carshop.sidebar", restored before hydration by a beforeInteractive
    script in app/layout.tsx. Screens ≤920px still collapse automatically (button hidden there).
  - Sidebar header (and top bar) 92px with the logo at 160px wide: ~16px above and below the logo.

  changes.md round 6 (sidebar):
  - Current-shop card removed from the sidebar (store-card.tsx deleted). Settings gets a "Your shop" card at the top
    (name, handle, shop ID, signed in as, role); the Overview shop card (under Business overview) gains the shop handle.
  - Sidebar menu tightened: items 7px padding / 1px apart, section gap 16px, nav top 14px.
  - Sidebar logo and "POS SYSTEM" centred. Collapse toggle is now a round ‹/› button straddling the sidebar's right edge at the
    header's bottom border (fixed position beside the sidebar so its scrolling doesn't clip it; slides with the width).
  - Sidebar header: 30px above the logo, 22px below (no divider); collapse button dark navy like the sidebar (blue on hover), level with the logo.
  - Collapse button icon: panel-close / panel-open (was a chevron), 30px.
  - Collapsed sidebar: collapse button moved below the car mark (8px gap), on the edge; no outline on the button.
  - Collapse button at the same height (72px) open and collapsed; both headers 114px and the section labels keep their
    (hidden) space when collapsed, so the menu icons don't move.

  Brand colours (from carshop_logo/: black #000, white #fff, racing red #EA1B25):
  - Accent (active menu, links, focus rings, eyebrows, icons, selected states, date picker): brand red #D9161F (tokens --blue* kept
    by name, now red). Greys are neutral (no blue tint); sidebar / dark surfaces near-black #111113; primary buttons black.
  - Information keeps its own blue (--info*): Sent / Dealership / vehicle badges, info notices, info toasts.
  - Status colours (green success, amber warning, red error) and the validated chart palette unchanged. Checkboxes use the brand red.
    Browser test on a fresh dev server: 13 checks passed (palette, sidebar collapse persistence, item payment → Paid, toast colours).

PHASE 6 — PDF, WhatsApp sharing, security, search, notifications, reports, phones (2026-10-15)
  - Security: rls_auto_enable() no longer callable via the API; current_tenant_id() moved to a private schema
    (RLS policies follow it by OID) with a SECURITY INVOKER wrapper in public. Only advisor warning left: leaked-password
    protection (Supabase dashboard toggle). Migrations 20261015180000/180100.
  - Shop details (Settings → Your shop): name, phone, email, address, NTN, STRN, terms; logo upload through
    POST /api/shop/logo (PNG/JPG checked by bytes, ≤1 MB, stored in shop-assets/<tenant>/). tenants.ntn/strn added.
  - PDF (@react-pdf/renderer): src/components/pdf/document-pdf.tsx, data via src/lib/printable.ts. Signed-in route
    /api/documents/<id>/pdf (?download=1); A4, logo, shop + customer details and tax numbers, lines with discounts,
    totals, payments + balance due and a status stamp on invoices, terms, page numbers.
  - Share links: quotes.share_token (random UUID). Public page /share/<token> + /share/<token>/pdf, read by a
    server-only service-role client (src/lib/supabase/admin.ts) by token only; drafts never shared; noindex.
    Document pages get a Share menu: View PDF, Download PDF, Share on WhatsApp (pre-filled message to the customer's
    number), Copy customer link. Links use NEXT_PUBLIC_APP_URL.
  - Global search (Ctrl/⌘ K): /api/search → documents (by any number, customer, walk-in name), customers, parts.
  - Notifications bell: RPC shop_alerts() → overdue invoices, invoices due within 3 days, low/out-of-stock parts,
    quotations expiring within 3 days, expired quotations still reserving stock. Unread count per browser.
  - Reports (/reports): date range picker; sales, profit/margin, payments collected, still owed; sales chart;
    top products / customers, payments by method, receivables aging, stock value + low stock; CSV export per table.
    RPC report_data(range, from, to).
  - Phones (≤768px): sidebar becomes a ☰ slide-out menu, top bar compacts, grids stack, tables / line items scroll
    inside their cards; no page scrolls sideways (fixed min-width and sr-only labels escaping table scroll boxes).
  - Dashboard "Coming next" card replaced by Quick actions.
    Browser tests: share/PDF/WhatsApp 8, search/bell/reports/phones 24 checks passed; logo upload route tested with
    curl (file uploads fail inside the sandboxed test browser only).

Manual by me:

Phase 6 is built and tested, with every open item folded in. Typecheck and lint pass, and the browser tests passed: 8 checks for PDFs and sharing, and  24 for search, notifications, Reports and phones.

  1. Security warnings
  - Two of the three Supabase warnings are fixed: one function is no longer callable through the API, and the other moved somewhere the API can't reach.    Your data and dashboard still read correctly afterwards.
  - The third, leaked-password protection, is a switch only you can turn on: Supabase dashboard → Authentication → password security.

  2. PDF quotations and invoices
  - A4 PDFs with your logo and shop details (address, phone, NTN, STRN), the customer, items with discounts, and totals.
  - Invoices also show payments, balance due and a status stamp; your terms print at the bottom.
  - Settings → Your shop is now editable, including a logo upload.

  3. Share and WhatsApp
  - Every saved document has a Share menu: View PDF, Download PDF, Share on WhatsApp, and Copy customer link.
  - WhatsApp opens to the customer's number with a filled-in message and a private link. The link opens a branded page with a PDF download and no login.
    Drafts can't be shared.

  4. Search (Ctrl K): finds documents by number or customer, customers, and parts by name or SKU. It works from the keyboard too.

  5. Notifications: the bell shows overdue invoices, invoices due within 3 days, low stock, quotations expiring soon, and expired quotations still      
  holding stock, with an unread count.

  6. Reports:
  - Pick any dates for sales, profit, payments collected and what's still owed, plus a sales chart.
  - Also top products and customers, payments by method, money owed by age, and stock value with the low-stock list.
  - Every table exports to CSV.

  7. Phones: a ☰  slide-out menu, a compact top bar, and stacked layouts. Every main page fits a phone with no sideways scrolling; wide tables scroll   
  inside their cards.

  I also replaced the dashboard's outdated Coming next card with Quick actions links.

  Before you rely on it:
  - Share links point to http://localhost:3000. NEXT_PUBLIC_APP_URL in .env.local is set to that, so customers can't open links until the app is online 
    and that setting is changed to the real address.
  - Fill in Settings → Your shop and upload your logo. Your real shop has no details or logo yet, so its PDFs will be plain. You can use
    public/brand/logo-black.png.
  - I couldn't click the logo upload in my test browser, because its sandbox blocks file uploads. I tested the upload route directly: real images are   
    accepted, fake ones rejected, and logged-out requests refused. Please try it once yourself.
  - Invalid share links show a "not found" page, though technically with a success status; nothing leaks.

  Not committed. The phase log and my notes are updated, and the test shop and its files are deleted. When you're happy, say "commit" and I'll use a    
  "Phase 6 - …" message.

Product categories (docs/categories.md), 2026-10-16:

The six fixed categories are replaced by your own category tree, up to 4 levels deep (e.g. Exterior › Wrapping › Wrapping Tools › Heat Gun).
  - Every shop starts with the list from docs/categories.md: 14 main categories, 157 in all. Your existing parts were moved over:
    Window Film → Exterior › Wrapping › Tinting Film, Vinyl Wrap → … › Vinyl Wraps, PPF → … › PPF, Car Audio → Audio,
    Accessories → Others, Hardware / Chemicals → Cleaning & Detailing.
  - Settings → Product categories: search, expand, add main categories or subcategories, rename, delete. Only admins can change them.
    A category with parts or subcategories can't be deleted. Duplicate names under the same parent are refused.
  - Part dialog: a searchable category picker; a part can sit on any level. Generate SKU uses the main category (EXT-, INT-, AUD-…).
  - Inventory: the category filter is the same picker with part counts, and picking a category includes everything below it.
    New Stock filter (in / low / out) and Sort (name, newest, lowest stock, price). Search also matches category names.
  - Badges show "Main › Sub"; hover for the full path.
Typecheck and lint pass; the browser test passed 14 checks (filters, picker search, add part, Settings add/rename/duplicate/delete, phone width).

Test steps:
  1. Inventory: open the category filter, pick Exterior, then search "floor" in the picker and press Enter.
  2. Add New Part: pick a deep category, press Generate for the SKU, save, and check the badge.
  3. Settings → Product categories: add a subcategory, rename it, delete it. Try deleting a category that has parts.
  4. Try the Stock and Sort filters.

Vehicle years from 1960 + shop's own vehicles, 2026-10-16:
  - The vehicle Year list now runs 1960–2026 (was 2015–2026). 1981–2014 came from NHTSA; NHTSA has nothing older,
    so 1960–1980 reuse each make's 1981 models.
  - "Vehicle not listed? Add it" under the vehicle pickers: type year, make and model; it is saved for your shop only
    (other shops don't see it) and linked to the part straight away. Typing a vehicle that already exists reuses it.
  - Vehicle lists are no longer kept in the browser for an hour, so new vehicles show up immediately.
  - npm run seed:vehicles takes --from=YYYY --to=YYYY (default 1981–2026).
Typecheck and lint pass; browser test passed 9 checks.

Test steps:
  1. Add New Part → Vehicle Specific: open Year and scroll to 1960. Pick 1975 → Toyota → Corolla.
  2. Click "Vehicle not listed? Add it", add e.g. 1972 Suzuki Mehran, save the part, then search "mehran".

Pakistan-market vehicles, 2026-10-16:
  - New list scripts/data/vehicles-pk.json: 32 makes, about 600 models, each with its production years (from 1960):
    Toyota, Honda, Suzuki, Daihatsu, Nissan, Datsun, Hyundai, Kia, Mitsubishi, Mazda, Changan, Deepal, BYD, Haval, Tank,
    GWM, ORA, Prince, DFSK, United, FAW, Chery, Jaecoo, Omoda, Jetour, MG, Proton, Isuzu, Peugeot, BAIC, Daewoo, Chevrolet.
  - Models come from PakWheels' make pages (local assembly + common Japanese/Chinese imports); years are each model's
    production span, so a few may be off by a year or two. Edit the JSON and re-run to correct or add models.
  - Loaded with npm run seed:vehicles:pk (8,514 vehicle-years added). The rough 1960–1980 copies for Toyota, Honda,
    Nissan, Hyundai and Kia were replaced by these real years. Catalog now 23,273 rows.
  - Short makes display in capitals (BYD, MG, FAW, DFSK, GWM, BAIC, ORA).

Test steps:
  1. Add New Part → Vehicle Specific: try 1985 → Suzuki (Khyber, FX…), 2016 → Suzuki (Mehran), 2025 → Changan / Haval / BYD / Prince.

Phase 8 (responsive foundations), 2026-10-17:
  - Viewport settings (notch-aware, keyboard resizes the page, zoom allowed up to 5x, dark browser bar colour).
  - Breakpoints consolidated onto 480 / 640 / 768 / 1024 / 1280 / 1536px (tokens in globals.css). The icon-rail sidebar now
    starts below 1024px (was 920px).
  - Fixed: screens 1025–1141px wide scrolled sideways (the main area had a 900px minimum width).
  - iPhone notch / home-bar spacing on the top bar, menu and pages.
  - No zoom-in when tapping a field on iPhone: phone fields use 16px text.
  - Menu: smoother slide, swipe left to close (it follows your finger), its shadow no longer shows on the page's left edge.
  - Phone top bar 56px.
Typecheck and lint pass; browser test passed 54 checks (no sideways scroll at 1440/1280/1100/1030/1000/800/393px on six pages,
16px fields, 56px bar, ☰ open, swipe close, short swipe snaps back, vertical scroll keeps it open, backdrop tap).

Test steps (Chrome DevTools → device toolbar → iPhone 14 Pro):
  1. Tap a field (search, a form): the page doesn't zoom.
  2. Tap ☰, then swipe the menu left: it follows your finger and closes; a short swipe snaps back. Tap the dark area to close too.
  3. Open each page: no sideways scrolling. Then try a 1100px-wide window: no sideways scrollbar.
  4. Commit: git add . && git commit -m "Phase 8 - responsive breakpoint tokens, drawer polish and ios zoom fix"

Phase 9 (pagination + phone cards), 2026-10-17:
  - Inventory, Customers, Invoices, Quotations and Drafts load one page at a time (25 / 50 / 100 per page) instead of
    everything (the old limit was 1,000 rows). "Showing 1–25 of 60", First / Previous / page numbers / Next / Last.
  - Page and rows-per-page live in the URL with the filters; changing a filter goes back to page 1; an old link to a page
    that no longer exists jumps to the last page.
  - All filters and sorts now run in the database (the Stock filter and Sort used to run after loading everything).
  - Counts and totals cover everything that matches, not just the page: "N products", "N low stock", the customer tiles,
    and the invoice footer totals.
  - Phones (768px and narrower): tables become cards — parts (tap for details, edit/delete), customers (one-tap WhatsApp,
    balance), documents (status, total, balance).
Typecheck and lint pass; browser test with a seeded test shop (60 parts, 30 customers, 40 invoices) passed 27 checks:
paging, rows per page, filters + paging, every invoice status, search, footer totals, directory tiles, phone cards.

Test steps:
  1. Inventory: if you have more than 25 parts, use the page buttons and the "25 / page" menu; pick a Stock filter (page resets).
  2. Invoices: try each status filter and the search; check the footer totals.
  3. Phone size (DevTools): Inventory, Customers and Invoices show cards; tap a part for details, a customer's WhatsApp icon.
  4. Commit: git add . && git commit -m "Phase 9 - server-side pagination and mobile table cards"

Phase 10 (phone document builder + cashier bar), 2026-10-17:
  - Phones (768px and narrower) on new/open drafts, quotations and invoices:
    - Bottom cashier bar: live total (or balance due on a part-paid invoice), number of lines, and the main button
      (Save when there are unsaved changes, otherwise Create Invoice / Convert to Invoice / Record Payment…).
    - Line items become cards with big +/− buttons and a delete button; tap a card to change quantity, price (custom
      items), discount or sale price in a sheet from the bottom.
    - "Search parts to add…" opens a full-screen search: the keyboard comes up at once, category chips (Audio,
      Lighting…) filter the list, each tap adds a part and the search stays open ("Done · 3 added").
    - "Choose a customer…" opens a full-screen customer search (Walk-in first, Register a new customer at the end).
    - The customer / number / dates box folds into one row (customer, number, due date, status); tap to open it.
  - Everywhere (desktop too): deleting a line shows an "Undo" toast that puts it back where it was.
Typecheck and lint pass; browser test with a temporary test shop (4 parts in 2 categories, 1 customer) passed 29 checks:
sheets open full-screen with the field focused, Audio chip shows only the 2 audio parts, two taps = quantity 2, 44px
buttons, +/−, bar total = document total, 10% discount in the edit sheet (Rs. 21,600), delete + Undo, bar pinned to the
bottom at the top and end of the page, no sideways scroll, invoice created from the bar, desktop unchanged. Test shop deleted.

Test steps (Chrome DevTools → device toolbar → iPhone 14 Pro, then /invoices/new):
  1. Tap "Choose a customer…", search, pick one: the top box folds into one row.
  2. Tap "Search parts to add…", try a category chip, tap a few parts, then Done.
  3. Use the big +/− on a card; tap a card and give it a discount; delete a line and press Undo.
  4. Check the bottom bar's total and button, then Create Invoice from the bar.
  5. Commit: git add . && git commit -m "Phase 10 - mobile document builder and sticky cashier bar"

Phase 11 (bottom sheets, quick cash, 80mm POS slip), 2026-10-19:
  - Phones (768px and narrower): Add / Edit Part, Register / Edit Customer and Record Payment open as sheets from the
    bottom: rounded top, grab handle, at most 90% of the screen, the form scrolls and Save / Cancel stay visible, also
    above the iPhone keyboard.
  - Record Payment (Cash): "Cash received" box with +Rs. 500, +Rs. 1,000, +Rs. 5,000 (they add up) and Exact Amount.
    "Received: Rs. 20,000 → Change Due: Rs. 4,000". Cash above what's owed is change, not a payment; less than that is
    recorded as a part payment. The success message says how much change to give.
  - POS slip for 80mm receipt printers (Epson, Xprinter, Sunmi): shop, number, dates, customer, items, totals, how it
    was paid, balance, a QR code to the customer link, terms. "Print POS Slip" prints it straight from the screen (the
    print dialog opens on the same page, no new tab; the paper is exactly as long as the slip). View / Download POS Slip
    are in the Share menu.
  - New setting, Settings → Quotations & invoices → Print format: "A4 PDF" (default) or "80mm POS slip". The print
    button next to Share follows it: "Print PDF" (A4, prints the PDF on the same page on computers; phones open it in
    their PDF viewer, which has Print) or "Print POS Slip". The Share menu offers View / Download in the same format. Applies to
    drafts, quotations and invoices; the customer's WhatsApp link always shows the A4 version.
  - Dashboard date range on phones: a sheet from the bottom with quick-range chips and one big month.
  - Bigger tap areas (44px) on phones and touch screens: category picker and Settings category rows and their buttons,
    filter chips, status / customer-type buttons, table row buttons.
  - Settings on phones no longer scrolls sideways (long shop ID / handle wrap).
  - Settings are only saved with "Save Settings": changing anything (shop details or settings) shows a bar at the
    bottom of the screen, "Unsaved changes", with Discard and Save Settings. Leaving the page with unsaved changes asks
    Keep editing / Discard changes / Save Settings. (Before, the only Save button was at the very bottom and leaving
    silently dropped the change; that's why the POS slip setting never took effect.)
  - The "Settings saved" / "Shop details saved" messages name only what was changed, one line each (e.g. "Print
    format updated to 80mm POS slip."), not every setting; a value changed and then changed back isn't listed.
Typecheck and lint pass; browser test with a temporary test shop (4 parts, a customer registered in the new sheet) passed
33 checks: three sheets on the bottom edge / 16px corners / handle / ≤ 90% / buttons visible, sheet above a 320px
keyboard, 48px sheet buttons, 44px category rows, chips and pills, quick cash (change, short payment, Exact, change in
the toast), POS slip 80mm × content height as one page with QR, 404 for other ids, phone date sheet (one month, 44px
days, custom range + chip), desktop dialogs / popover unchanged, no sideways scroll. Print format round (12 checks): A4
shows only PDF items, the setting saves, POS shows only slip items + toolbar button (phone too), printing stays on the
page, paper sized 80mm × slip height, Chrome's print output is one 80mm page with only the slip, cleanup after printing,
slip PDF downloads. Save-bar round (14 checks, in-app navigation): no bar until a change, bar pinned to the bottom
(phone too, 44px buttons), leaving asks, Save Settings saves and an already-opened invoice then shows Print POS Slip,
Discard restores both forms, leave → Discard saves nothing, leave → Save saves then leaves, the invoice builder's leave
prompt still works. Test shops deleted.

Test steps (Chrome DevTools → device toolbar → iPhone 14 Pro):
  1. Inventory → Add New Part: it slides up from the bottom; scroll the form, Save stays at the bottom.
  2. Open an unpaid invoice → Record Payment → Cash: tap +Rs. 5,000 a few times and check Change Due; tap Exact Amount.
  3. Settings → Print format → 80mm POS slip: the save bar appears → Save Settings. Open an invoice: the button next to Share is "Print POS Slip" and
     the Share menu has View / Download POS Slip. Switch back to A4 PDF: "Print PDF" (print dialog on the same page) and
     View / Download PDF.
  4. Dashboard → date range: a sheet with one month; pick two days and Apply.
  5. Commit: git add . && git commit -m "Phase 11 - bottom-sheets, quick cash and 80mm thermal receipts"

Phase 12 (superadmin schema, shop settings columns, Resend email), 2026-10-19:
  - Database: profiles.is_superadmin (nobody can set it from the app), superadmin_audit_logs (for Phase 13),
    email_logs (every email sent, readable by shop admins, written by the server only). New shop columns for
    Phase 14: status (active / suspended / trial), document prefixes (INV / Q / D) and "start from" numbers, bank
    details (bank, account title, number, IBAN, Raast ID, wallets) and invoice terms.
  - Document numbers use the shop's prefix and start-from number; existing documents keep their numbers and new ones
    continue the series (INV-1001 → INV-1002).
  - Email through Resend: welcome, password reset (1-hour link), staff invite, document share (PDF attached + link)
    and payment receipt templates. Without RESEND_API_KEY emails are printed to the server console instead. At most
    100 emails per shop per hour. Replies go to the shop's email address.
  - New: Share → "Email to customer" on quotations and invoices. The customer's email is filled in; invoices with
    payments can send the invoice (PDF attached) or a receipt for the latest payment. The address can be changed for
    one send; that doesn't change the customer's profile (a hint under the field says so).
  - Note: until a domain is verified in Resend, emails can only go to the Resend account's own address
    (hamzi207@gmail.com); other addresses get a clear message. Verify a domain in Resend and set RESEND_FROM_EMAIL
    before going live.
Typecheck and lint pass. Database checks: numbering continues, floor and prefix apply, shop admins can't set
is_superadmin / status or write email_logs. Real send test: INV-1001 as a document email (PDF attached) and as a
payment receipt (sample payment, not saved) — Resend shows both delivered, both logged in email_logs as sent.

Test steps:
  1. Open INV-1001 → Share → Email to customer → enter hamzi207@gmail.com → Send Email. Check your inbox (and spam)
     for the email with the PDF.
  2. Try another address: you get "Email can only go to the account owner's address until a domain is verified".
  3. Supabase → Table editor → email_logs: one row per send.
  4. Create a new invoice: its number continues the series.
  5. Commit: git add . && git commit -m "Phase 12 - superadmin schema, shop settings columns and resend email"

Phase 13 (superadmin control plane, shops, users, Login As), 2026-10-19:
  - New /admin console for platform superadmins (dark bar with the red line): Overview, Shops, Users. Anyone else
    who opens /admin goes to their dashboard. The user menu shows "Superadmin console" for superadmins.
  - Overview: number of shops (active / trial / suspended / new this month), users who signed in in the last 30
    days, total sales across all shops (this month and collected), open quotations and drafts, a chart of new
    shops per month, the newest shops and recent superadmin activity.
  - Shops: search by name, handle, phone or owner email; filter Active / Trial / Suspended. Create Organization
    (shop name, owner, email, phone, Active or Trial) sets the shop up like a normal sign-up and emails the owner
    a "Choose your password" link. Each shop has Login As, Edit company details (same form as Settings, with the
    logo) and Activate / Mark as trial / Suspend.
  - Suspended shops: their users are signed out at the next click and see "This shop's account is paused ...
    contact CarShop POS support"; they can't sign in until the shop is activated. Nothing is deleted.
  - Users (all shops): search, change Admin / Staff (a shop always keeps one admin), and reset a password by
    email (one-time link, 1 hour) or with a temporary password shown once.
  - Login As: you see and work in that shop as its admin, with a red banner on every page ("you're acting as
    ...", when it ends, Exit). It lasts at most 2 hours. Starting, leaving and every change you make while inside
    are written to the audit log.
  - Choose a password page (/reset-password) for the email links.
Typecheck and lint pass. Database checks for Login As isolation (only the superadmin who started it, not after
expiry or losing superadmin, suspended shops see nothing). Browser test with temporary shops: 34 checks passed
(see PROJECT_SPEC.md §7 Phase 13). Test shops, users and log rows were deleted.

Test steps:
  1. Make yourself superadmin (Supabase SQL editor):
       update profiles set is_superadmin = true where email = 'hamzi207@gmail.com';
     Then open the user menu → Superadmin console (or go to /admin).
  2. Overview shows your shop's figures.
  3. Shops → Create Organization: e.g. "Test Shop", owner name, an email you can receive (until a domain is
     verified in Resend, only hamzi207@gmail.com gets emails; another address still creates the shop but the
     email fails — use Users → Set a temporary password to sign in as that owner).
  4. Open the shop → change the address → Save Settings.
  5. Login As → the red banner appears on every page; Exit takes you back to Shops.
  6. Users → the ⋯ menu → Email a password reset link (to your own address) or Set a temporary password.
  7. Optional: Suspend the test shop and try signing in as its owner; then Activate it.
  8. Commit: git add . && git commit -m "Phase 13 - superadmin control plane, tenants, users and impersonation"

Phase 14 (settings sections, team, numbering and bank details), 2026-10-19:
  - Settings now has tabs: Profile, Localization, Categories, Team, Documents, Printing, POS. The existing cards
    moved into them; each tab saves only its own settings with its own Save Settings bar.
  - Documents: prefix and "start from" for quotations, invoices and drafts, with a live "Next number" (e.g.
    INV-5001; numbers never go back or repeat). Separate quotation terms and invoice payment terms, each printed
    on its own documents. Bank details: bank, account title, account number, IBAN (checked), Raast ID and up to 5
    mobile wallets (JazzCash, EasyPaisa, SadaPay, NayaPay).
  - Invoices that still have a balance show a "Bank Remittance" box below the totals on the PDF and on the
    customer link (with Copy IBAN). Quotations and paid invoices don't.
  - Team: everyone in the shop with role and status (Active / Invited / Deactivated). Invite Team Member (name,
    email, Staff or Admin) emails a link to choose a password (1 hour). Change role (a shop always keeps an admin),
    Resend invite, Cancel invitation, Deactivate (signed out straight away, can't sign in, their documents stay)
    and Reactivate. Staff can see the team but not change it.
Typecheck, lint and production build pass. Browser test on the production build: 53 checks passed (see
PROJECT_SPEC.md §7 Phase 14); Phase 13 checks re-run: 34/34. Test data deleted.

Test steps:
  0. Restart `npm run dev` first (it was serving an old copy of the PDF/share-page loader during testing).
  1. Settings → Documents: set prefixes (e.g. invoices "HAA-INV", start from 5001) and bank details (an IBAN,
     a JazzCash number), then Save Settings.
  2. Create an invoice (leave it unpaid) → Share → View PDF: Bank Remittance below the totals.
  3. Share → Copy customer link → open it: the bank card with Copy IBAN.
  4. Settings → Team → Invite Team Member with a test address (e.g. staff@test.local). Until a sending domain is
     verified in Resend only hamzi207@gmail.com receives email, so the toast says the email didn't go out, but the
     member appears as Invited. To sign in as them: /admin → Users → ⋯ → Set a temporary password. After they
     sign in they show as Active; try Deactivate / Reactivate.
  5. Commit: git add . && git commit -m "Phase 14 - settings sections, team, numbering and bank details"

Phase 15 (inventory CSV import/export, chart labels, 4K, final build), 2026-10-19:
  - Inventory: Export CSV downloads every item (not just the page on screen) and Import CSV adds or updates many
    parts at once from Excel / Google Sheets. Download template shows the columns: SKU, Name, Category (e.g.
    Exterior › Wrapping › PPF), Cost Price, Sale Price, Stock, Universal (Yes/No), Vehicles (e.g. 2018-2022
    SUZUKI Alto; 2020 Honda Civic), Vendor, plus optional Low Stock Alert, Price Includes Tax, Description.
  - Before anything is saved, a preview checks every row and highlights problems (unknown category or vehicle,
    duplicate SKU, prices that aren't numbers…). Rows with problems are skipped; the rest are imported with a
    progress bar. Items whose SKU already exists are only changed when "Update items with the same SKU" is
    ticked; empty cells keep the current value. An exported file can be edited and imported back.
  - Charts narrower than 480px (phones) show every other date label so they don't overlap.
  - On very large screens (1440p / 4K) pages stay at most 1720px wide, centred.
npm run lint and npm run build pass. Browser test on the production build: 21 checks passed, including no
sideways scrolling on 11 pages at phone, tablet, laptop, desktop and ultrawide sizes (see PROJECT_SPEC.md §7).

Test steps:
  1. Inventory → Export CSV: open the file in Excel; every item is there.
  2. Inventory → Import CSV → Download template; fill a few rows (try a wrong category on one), save as CSV,
     choose it: the preview shows the problem; Import the rest.
  3. Change a price in the exported file, tick "Update items with the same SKU" and import it.
  4. Reports on a phone: the sales chart's dates don't overlap.
  5. Commit: git add . && git commit -m "Phase 15 - inventory csv import/export, chart labels and 4k containment"

Phase 16 (Version 2: ProductLogik rebrand, accent colour, Urdu PDFs, What's new, dark mode), 2026-10-20:
  - CarShop.Pk POS is now ProductLogik POS: new logo (copied unchanged from the ProductLogik brand files),
    favicon and app icon, emerald/slate colours, Plus Jakarta Sans font, and "products" instead of "parts"
    everywhere (app, PDFs, POS slip, share page, emails, admin). It can be installed like an app on phones.
  - Nothing resets after the update: the old sidebar setting, seen alerts and a "Login As" session started
    before the update keep working.
  - Settings → Profile → Document colour: pick a preset or your own colour (too-light colours are refused).
    A4 PDFs, share links and emails use it; the POS slip stays black. The superadmin can set it per organization.
  - Urdu (and Arabic) names, addresses and notes print correctly on the A4 PDF and the POS slip.
  - What's new: a gift icon in the top bar with a dot when there's news; opening it clears the dot.
  - Dark mode: your name in the top bar → Light / Dark / System. Remembered per browser, no flash on reload.
    Documents (A4 PDF, POS slip, share page, emails) always stay light.
  - GitHub repo renamed to productlogik-pos (the old link redirects); the remote is updated.
  - Docs: README rewritten, PROJECT_SPEC title/vision/scope updated, new docs/regression-checklist.md.
Typecheck, lint, contrast check (48 pairs, all AA) and production build pass. Browser check: light and dark on
7 pages at desktop and phone plus the add-product dialog (see PROJECT_SPEC.md §7 Phase 16). Test data deleted.

Test steps:
  0. Restart `npm run dev` (a production build ran during testing).
  1. Log in: the ProductLogik logo, colours and font show; the browser tab has the new icon.
  2. Top bar → gift icon: the "Welcome to ProductLogik POS" note; the dot goes away and stays away after a reload.
  3. Your name → Dark: every page and dialog is readable. Reload: it stays dark with no white flash.
     Open an invoice PDF and the customer link: they stay light. Switch back to Light or System.
  4. Settings → Profile → pick a document colour → Save; the invoice PDF and customer link use it.
  5. Add a product named in Urdu, put it on an invoice, open the PDF and the POS slip: the Urdu reads correctly.
  6. On an Android phone in Chrome: menu → Install app.
  7. Go through docs/regression-checklist.md.
  8. Commit: git add . && git commit -m "Phase 16 - productlogik rebrand, accent colour, urdu pdfs, whats new and dark mode"

Phase 17 (Version 2: superadmin console, subscriptions, manual billing, separate superadmin accounts), 2026-10-21:
  - Superadmins are their own accounts with no shop. They sign in at /admin/login, then enter a 6-digit code
    from an authenticator app (/admin/mfa). Shop users sign in at /login. Neither sign-in accepts the other
    kind of account, and there are no links between the console and a shop. Login As still opens any shop.
  - Organization page tabs: overview with health score, notes, tags and follow-ups; profile, localization,
    documents, printing, categories, users (CSV invite), subscription, data (full export, superadmin only,
    audited) and activity. Suspend with a reason; archive and restore (never deleted); archived rows change
    colour with age.
  - Subscription plans (monthly or yearly), plan per organization, invoices, wallet or bank payments verified
    by the superadmin, grace period and suspension when unpaid, Settings → Subscription in each shop, daily
    run at /api/cron/subscriptions, billing overview.
  - Console: Needs attention, Users, Plans, Billing, Audit, Team (add / remove superadmins, reset two-factor),
    Platform settings and announcements, Vehicle catalog (search, add, edit, deactivate, merge).
  - Light / dark button in the top bar of the shop and the console.
  - Not built: document overrides, platform default lists and console imports (later phases), Login As
    permission bypass (Phase 22).
Typecheck, lint and production build pass. Browser tests with temporary accounts (deleted): two-factor 9/9,
console separation 20/20 (see PROJECT_SPEC.md §7 Phase 17).

Test steps:
  1. /admin/login with your superadmin account (hamzi207+admin@gmail.com) → code from the authenticator → console.
  2. /login with the same account: refused. /login with hamzi207@gmail.com → your shop, no console link.
  3. Console → a shop → Login As → its dashboard with the banner → Exit returns to the console.
  4. Theme button (sun / moon) in both top bars switches light and dark.
  5. Plans → assign a plan to a shop → issue an invoice → record a payment.
  6. Team → Add Superadmin with a new email: the invitation arrives.
  7. Commit: git add . && git commit -m "Phase 17 - superadmin console, subscriptions, billing and separate superadmin accounts"

Phase 18 (Version 2: industries, superadmin category catalogs, attributes, onboarding checklist), 2026-10-24:
  - 14 industries, each with its own category catalog (Automotive from V1, 13 new trees, 1,052 categories).
    Every organization has one industry and sees only that catalog plus categories made for it alone.
  - No self sign-up: /register is gone and the superadmin creates every organization (Create Organization
    picks the industry).
  - Categories are superadmin-only. Console → Catalog: industries, category trees (colour, image, prefix,
    icon, move, archive), duplicate a tree, CSV import with preview and export, attributes, request queue.
  - Organization page: Products, Categories (hide catalog categories, add its own, own attributes),
    Industry & modules (change-industry wizard, Vehicle Fitment switch, setup checklist), setup % on the
    Overview and in the Organizations list.
  - Shop: Settings → Categories is read-only with "Request a category"; the answer arrives in the bell.
    Vehicle fitment shows only for organizations with the module (Automotive by default).
  - Custom attributes (e.g. Storage, Colour) in the product dialog, filters, search, CSV attr: columns and
    on invoices when flagged. Category colours and images in pickers and chips. Get started card with 9 steps.
  - Fixed in the browser checks: "first customer" was ticked by the automatic walk-in customer; changing an
    organization's industry lost its attributes; the Settings tab row cut off "Subscription".
  - Not built: a notification bell in the console (requests show as a count on Catalog, plus the email).
  - From the owner's fitment test (2026-10-24/25, fitment steps 1–4 match V1): the UI is called "ProductLogik
    Invoicing System" (repo stays productlogik-pos); "Built by Hamza Latif" in the sidebar and sign-in footers;
    shop logo beside the Overview greeting (switch in Settings → Localization → Overview page); shop Settings
    full width like the console, with a bottom save bar styled like the top bar; search boxes wait 0.5 s;
    "free" → "available"; discard toasts amber and toast colours checked against their purpose.
Typecheck, lint and production build pass. SQL isolation test 36/36. Browser checks with temporary
organizations and a temporary superadmin, deleted afterwards (see PROJECT_SPEC.md §7 Phase 18).

Test steps:
  1. Console → Catalog → Categories: pick an industry, add a category, give it a colour; archive it again.
  2. Console → Organizations → Create Organization with a grocery industry → sign in as that owner:
     grocery categories in Add New Product, no vehicle fields, Get started card at 0 of 9.
  3. Your shop: Inventory still shows fitment type and vehicles; Add New Product has Universal / Vehicle Specific.
  4. Your shop → Settings → Categories → Request a category → console Catalog → Requests → Approve →
     the shop's bell shows it and the picker has it.
  5. Console → Attributes: add a list attribute to a category → it appears in that category's product
     dialog, the inventory filters and Export CSV.
  6. Commit: git add . && git commit -m "Phase 18 - industries, category catalogs, attributes and onboarding"

Phase 19 (Version 2: units of measure, decimal quantities, customer types and tags), 2026-10-25:
  - Units of measure per organization (seeded from its industry), each with 0-3 decimal places. Every
    product has a base unit; quantities are decimals (1.250 kg, 2.5 m) everywhere, with the unit printed.
  - Packs: a product can also be sold as a box / carton etc. (holds N base units, own price, own barcode).
    Document lines pick the unit; stock converts (1 box = 12 pcs). Scanning a pack barcode starts a line in it.
  - RF-19.1: purchase and sale units per product; new lines start in the sale unit. CSV has Unit, Other
    Units, Purchase Unit and Sale Unit columns.
  - Customer types are each organization's own list (default, "needs tax details" flag, archive); renames
    follow to customers; flagged types need a CNIC or NTN.
  - RF-19.2: coloured customer tags. Staff assign them in the customer dialog; chips on the list and profile;
    ?tag= filter; Export CSV on Customers; Reports tag filter.
  - Packs are switched on in Settings → Units ("Sell and buy in packs", off by default; adds Box, Carton,
    Pack and Dozen; saved from the Save Settings bar) and only units marked "Can be a pack" can be packs.
  - Measuring units: presets for mm, cm, in, ft, rft, m, sqft, sqm, sqyd, cbm, cft, kg, ton, lb, l, gal, roll
    and sheet; Add unit has a "Common unit" pick; measuring industries seed more of them. The product dialog's Sell in / Buy in
    pickers offer pcs, box, pair…; picking a new pack adds its row. Purchase orders stay in Phase 25 (plan Rev 9).
  - Settings → Units and Settings → Customers tabs (admins edit, staff read); console organization tab
    "Units & customers" with the same cards (audited).
  - Not built: purchase units on purchase orders (Phase 25); tags on statements / price lists (Phases 30, 26);
    packs in the console Products tab.
Typecheck, lint and production build pass. Rolled-back SQL tests for stock in packs, decimals, types, tags,
defaults, deletes and the tag report filter all pass; the V1 quote total is unchanged.

Test steps:
  1. Settings → Units: switch on "Sell and buy in packs". The Save Settings bar appears (Discard puts it
     back; clicking another tab asks first). Save: Box, Carton, Pack and Dozen appear, marked Pack.
  1b. + Unit → Common unit: pick Inch (in); code, name and decimals fill in. Save. Inch drops out of the pick.
  2. Inventory → edit a product → Packs & selling units → Sell in: Box (new pack) → holds 12, barcode 1234.
     Buy in: Carton → holds 144. Save.
  3. New invoice: the product's line starts as 1 box at 12 × the price; switch it to pcs. Type 1234 in the
     search: it adds a box line. Save: stock drops by 12 per box.
  4. Settings → Customers: add a tag "Monthly billing" (blue), add a type with "Needs tax details".
  5. Customers → edit Hamza Traders → give it the tag and the new type (it asks for a CNIC/NTN). The chip
     shows on the list and profile; the tag filter and Export CSV include it; Reports → tag select.
  6. Console → Organizations → your shop → Units & customers: the same lists and the packs switch.
  6b. Switch packs off (a note explains packs are kept), then Save Settings: the product dialog has no
      Packs section and new lines use pcs.
  7. Commit: git add . && git commit -m "Phase 19 - units of measure, decimal quantities, customer types and tags"

Phase 20 (Version 2: multiple stores and per-store stock), 2026-10-25 (migrations applied 2026-10-25; moved to the Frankfurt database 2026-10-26; tested by the owner and committed 2026-10-26):
  - Stores: every organization gets a Main Store (V1 stock, documents and members move into it, so a
    single-store shop sees no change). Settings → Stores: add / edit / switch off stores (code, address,
    phone, NTN, STRN for that store's documents), who works where, and a default store per staff member.
  - Stock is kept per store (stock_levels) and every change goes through one function that writes the
    stock ledger (stock_movements; its screen is Phase 24). Item totals stay the sum of the stores.
  - Top-bar store switcher; new documents go to the current store and use its stock. Everyone sees every
    store's stock: inventory "Other stores: N" with a per-store table, details panel table, search hints
    ("Only 2 here · 15 at Store B"). Low-stock alerts per store.
  - Optional "Allow invoicing from other stores' stock" (admins only, or everyone): a line can take its
    stock "From" another store. Checked in SQL.
  - RF-20.1: store prices and per-store low-stock levels in the product dialog (admins).
  - RF-20.2: "Number documents per store" (LHR1-INV-1001), each store continuing its own series.
  - Lists, dashboard and reports show the current store, with "All stores" for admins.
  - Console: organization tab Stores; Products tab sets stock per store; plan usage counts stores.
  - Rev 11: stores and users are part of the subscription. Organization admins add stores / invite users
    only up to its limits and edit them; deleting stores and switching them off / on is console-only.
  - Settings tab bars stay on one row; Printing + POS became "Tax & Printing"; card gaps on Stores,
    Customers and Subscription; Subscription's billing dates always shown.
Typecheck and lint pass. Migrations 20261025060617_phase20_stores, 20261025061033_phase20_documents,
20261025061231_phase20_store_filters, 20261025113733_phase20_store_access,
20261025133202_phase20_invoice_facts and 20261025135431_phase20_invoice_due_date applied 2026-10-25
(stock, documents and lines unchanged); 15 rolled-back SQL checks pass, plus 8 for who may add / switch
off / delete stores and 6 for a saved invoice (staff swap the customer, never remove it; only admins and
the console move the due date).

Test steps:
  1. Nothing looks different yet: inventory stock, documents and numbers are as before (one store).
  2. Settings → Stores → + Store: "Liberty Market", code LHR2. The top bar now shows the store switcher.
  3. Inventory: the stock column says Main Store's stock and "Other stores: 0". Switch to Liberty Market
     (top bar), edit a product: STOCK ON HAND AT LIBERTY MARKET = 5, set a store price. Save.
  4. Switch back to Main Store: the product shows "Other stores: 5"; click it for the per-store table.
  5. New invoice in Main Store for more than Main Store has: the line says "Only N here · 5 at Liberty Market"
     and saving is refused.
  6. Settings → Stores → Allow invoicing from other stores' stock → Save Settings. The line now has a
     "From" select: pick Liberty Market and save. Liberty Market's stock drops, Main Store's doesn't.
  7. Switch to Liberty Market, new quotation: the line starts at the store price.
  8. Open the Main Store invoice while in Liberty Market: it asks to switch store before changing it.
  9. Number documents per store (give Main Store a code first): the next invoice is LHR2-INV-1001 in
     Liberty Market. Invoices list: This store | All stores; All stores shows a Store column.
 10. Console → Organizations → your shop → Stores: the same cards; Products tab: STOCK AT select.
 11. Subscription limits: console → your shop → Subscription → set the store limit to 2. Settings → Stores
     says "The subscription includes 2 stores: 2 open", the + Store button is gone and a note says to
     request a plan change. Shop admins have no delete button or Open switch; the console has both.
     Same on Team with a user limit. Put the limits back afterwards.
 12. Laptop width: the Settings tab bar stays on one row (icons drop first, then labels shorten); the
     console's organization tabs too. Tax & Printing shows the Tax and Print format cards.
     New invoice for Hamza Traders (15 credit days): Due date reads "09 Nov 2026" and the calendar
     still opens on click. Every date in lists, documents and the console reads like "09 Nov 2026".
     Dropdowns all look alike (Settings → Stores "Who can do it", inventory filters, dialogs), in light
     and dark. Invoices list: "Main Store | All stores" is a bordered toggle in its own bar.
     Open a saved invoice: the customer has a "Change" button, not ×; Change → search, "Keep current"
     goes back, picking another customer swaps it. As staff the due date is read-only (and stays put
     when the customer changes); as an admin it can still be changed.
 13. Commit: git add . && git commit -m "Phase 20 - multiple stores, per-store stock, store prices and numbering"

Phase 21 (Version 2: product variants, kits and image gallery), 2026-10-26 (migrations applied 2026-10-26;
waiting for the owner's test, not committed):
  - Products with variants: Add New Product → Product with variants. Options (up to 3, e.g. Colour and
    Size) with a price change per value; the matrix lists every combination with its own SKU, barcode,
    price, cost, low-stock level, stock and an on / off switch, and bulk-edits ticked variants.
  - Inventory: Grouped | All SKUs. A group is one row (price range, total stock, low count) that opens to
    its variants. Variants are switched off in their group; one on documents is archived, not deleted.
  - RF-21.1 kits: Add New Product → Kit. A kit has its products instead of stock; its stock is the whole
    kits they make at the store, its cost theirs. Selling one reserves / deducts its products (ledger
    "Kit: <name>"), and documents show "Includes: 2 × Clip, 1 × Cable".
  - RF-21.2 images: up to 8 per product, kit or group (resized in the browser, reorder by dragging), shown
    in the list, line search, option picker and details. Settings → Tax & Printing → Product images on
    documents: separate switches for estimates, quotations and invoices, plus "On the A4 PDF" and "On
    the customer link" (console too): the chosen documents show line thumbnails where those say.
  - One barcode per product / variant / kit; scanning it adds exactly that one.
  - Line search: a product with variants appears once and opens the option picker (buttons per option
    with the stock they leave); the phone sheet too.
  - CSV: Barcode, Kit Components, Group and Option 1–3 Name / Value columns; import and export round-trip.
  - Counts for the plan, near-limit list and categories leave out archived variants.
Typecheck and lint pass. Migrations 20261026062158_phase21_variants_kits_schema,
20261026063021_phase21_variants_kits_functions, 20261026063116_phase21_drop_old_save_item,
20261026063220_phase21_save_inventory_item, 20261026063341_phase21_stock_reports,
20261026063415_phase21_product_images, 20261026064048_phase21_switch_off_after_stock,
20261026071226_phase21_kits_never_low, 20261026072926_phase21_images_on_pdf and
20261026133336_phase21_images_on_share applied 2026-10-26; rolled-back SQL checks pass (variant prices and
switching off, kits reserving / deducting / refusing / returning stock and their cost, barcode scans,
images: own folder only, order only).

Test steps:
  1. Inventory → Add New Product ▾ → Product with variants: "Polo Shirt", prefix POLO, a category, cost
     600, price 1200, stock unit pcs. Options: Colour = Red, Blue; Size = M, L (L +100). The matrix shows
     4 variants: POLO-RED-M … with prices 1200 / 1300 as placeholders. Give Red / M stock 5 and a barcode,
     switch Blue / L off, add two photos (drag the second first). Add Product.
  2. The list (Grouped) shows Polo Shirt with "3 variants", 1,200 – 1,300 and its photo; the arrow shows
     the variants. All SKUs lists each one with "Red / M" chips. Edit Polo Shirt: tick Red / L and Blue / M,
     Set price 1500 → Apply, Save; both now cost 1500.
  3. New estimate (draft): type "polo" → one Polo Shirt row; click it → the option picker. Choose Red,
     then M (shows "5" left) → Add. The line is "Polo Shirt – Red / M". Type Red / M's barcode in the
     search: it's added straight away. Leave the draft (drafts don't hold stock).
  4. Add New Product ▾ → Kit: "Polo gift set", price 2500, products: Polo Red / M × 2. Its stock shows
     "2 kits available" and its cost is 1,200. Quotation with 1 kit: Red / M shows 2 reserved and the kit
     "1 kit available". Invoice 1 kit: Red / M's stock drops from 5 to 3; the PDF shows
     "Includes: 2 × Polo Shirt – Red / M".
  5. Settings → Tax & Printing → Product images on documents: switch Invoices on, Save Settings. The
     invoice PDF and its customer link show the photo beside the polo line; a quotation's don't. The console
     (your shop → Tax & Printing) has the same switches. Switch "On the A4 PDF" off and Save Settings:
     the invoice PDF is text-only again while its customer link still shows the photo. Then switch "On
     the customer link" off too: the link is text-only as well.
  6. Edit Polo Shirt and switch Red / M off: refused (it has stock and is in the gift set). Switch Blue / M
     off instead and save: it's removed (no documents). Switching it on again later brings it back. A
     variant that is on documents is archived instead, and those documents still print it.
  7. Export CSV: Group, Option 1/2 Name / Value, Barcode and Kit Components are filled. Import the file
     again with "Update items with the same SKU": every row says update and nothing changes.
  8. Phone width: inventory cards for Polo Shirt open to their variants; the option picker is a bottom
     sheet with big buttons; the variant dialog's matrix scrolls inside its box.
  9. Commit: git add . && git commit -m "Phase 21 - product variants, kits and image gallery"
