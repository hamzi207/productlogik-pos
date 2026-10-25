# FOUNDER_SETUP_GUIDE.md: The Complete Beginner's Launch Manual
## Building the B2B Car Accessory Quoting & POS Engine from Scratch

> **Who is this for?** This guide is written specifically for you as a first-time founder and beginner. It assumes **zero prior SaaS launch experience**. Every single click, command, dashboard button, and test checkpoint is laid out in exact chronological order.

---

## Table of Contents
1. [Founder Mindset & How Your AI Team Works](#1-founder-mindset--how-your-ai-team-works)
2. [Phase 0: Machine Pre-Flight Check](#2-phase-0-machine-pre-flight-check)
3. [Step 1: Visual Design & UI Template in Figma](#3-step-1-visual-design--ui-template-in-figma)
4. [Step 2: Supabase Connection & Automated Database Setup](#4-step-2-supabase-connection--automated-database-setup)
5. [Step 3: Populate Your .env.local File](#5-step-3-populate-your-envlocal-file)
6. [Step 4: Launching Claude Code & Starting Phase 1](#6-step-4-launching-claude-code--starting-phase-1)
7. [Step 5: Testing & Git Commit Checklist (Phases 1 to 6)](#7-step-5-testing--git-commit-checklist-phases-1-to-6)
8. [Beginner Troubleshooting & Emergency Playbook](#8-beginner-troubleshooting--emergency-playbook)
9. [Going Live: Superadmin Console & Two-Factor](#9-going-live-superadmin-console--two-factor)

---

## 1. Founder Mindset & How Your AI Team Works

### You Are the Technical Product Manager
You do not need to memorize every line of TypeScript or SQL. Your job is to:
1. Provide the specification document ([`PROJECT_SPEC.md`](file:///d:/SpicedProjects/Projects/productlogik-pos/docs/PROJECT_SPEC.md)) as the single source of truth.
2. Instruct your AI agents (**Claude Code** in your terminal and **Antigravity** in your IDE) to build one specific phase at a time.
3. Test each feature in your web browser like an actual auto accessory store owner.
4. Save your progress with `git commit` before approving the next phase.

### The Golden Rule: Never Let the AI Rush
AI agents can code at blistering speed, but if you let them build Phase 1 through Phase 6 in one shot without pausing, errors will compound. 
> 🛑 **Rule**: After every phase, Claude Code **must stop and wait** for you to verify the feature in your browser and commit the code.

---

## 2. Phase 0: Machine Pre-Flight Check

Before touching any code, verify that your computer has the necessary software installed.

### 2.1 Open Your PowerShell Terminal
1. Press `Windows Key + S`, type **PowerShell**, and press **Enter**.
2. Navigate to your project directory:
   ```powershell
   cd d:\SpicedProjects\Projects\productlogik-pos
   ```

### 2.2 Check Node.js
Run:
```powershell
node -v
```
- **If it shows `v18.17.0` or higher (e.g. `v20.x.x` or `v22.x.x`)**: You are ready!
- **If you get an error (`node is not recognized`)**:
  1. Visit [nodejs.org](https://nodejs.org).
  2. Download and run the **LTS (Long Term Support)** installer.
  3. Accept the defaults, complete the installation, and restart your PowerShell.

### 2.3 Check Git & Set Your Name
Run:
```powershell
git --version
```
If Git is installed, configure your name and email (used for project history):
```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2.4 Install Claude Code CLI
Claude Code is Anthropic's official terminal agent. Install it globally:
```powershell
npm install -g @anthropic-ai/claude-code
```
Once installed, verify it:
```powershell
claude --version
```
*(When you run `claude` for the first time, it will prompt you in the browser to log in with your Anthropic account or enter your Anthropic API Key).*

---

## 3. Step 1: Visual Design & UI Template in Figma

> 🟢 **STATUS UPDATE**: **ALREADY COMPLETED!**  
> You ran the Figma prompt and generated the UI project. It is saved in your workspace folder:  
> 📁 **`d:\SpicedProjects\Projects\productlogik-pos\design\figma-ui\`**  
> 
> - **Main Component**: `design/figma-ui/src/App.tsx` (Contains the full interactive screens for Dashboard, Quoting Wizard, Inventory Table, and Customer CRM).
> - **Styling & Design Tokens**: `design/figma-ui/src/index.css` (Contains the exact color tokens, dark slate sidebar, buttons, status pills, and responsive layout classes).
> 
> Claude Code will directly inspect and port this code into your Next.js project during Phase 1. You don't need to generate anything else in Figma!

### 3.3 What Your UI Should Include (Visual Verification)
Make sure your template displays the **4 core screens**:
1. **Screen 1: Main Store Dashboard**: Top navigation with store switcher ("Apex Auto Accessories"), 4 KPI cards (Monthly Revenue, Active Quotes, Low Stock Alerts, Fulfilled Orders), Recent Quotes table, and Low-Stock Restock card.
2. **Screen 2: Quoting Engine & YMM Magic Filter**:
   - Customer picker.
   - Cascading vehicle selector: `[Year]` $\rightarrow$ `[Make]` $\rightarrow$ `[Model]`.
   - Magic Fit Part table (only shows parts that fit the selected car + universal items).
   - Line items list with an **"+ Add Optional Fitting / Labor Service"** button.
   - Sticky totals drawer with Discount, Tax, Grand Total, and "Mark as Paid" button.
3. **Screen 3: Inventory Management Table**:
   - SKU, Product Name, Category tabs.
   - Fitment badges: Emerald `Universal Fit` vs Blue `Vehicle Specific`.
   - Margins %, On-hand stock count with colored pills (Green for good, Rose Red for low stock).
   - "Add / Edit Part" modal with Year/Make/Model vehicle tagger.
4. **Screen 4: B2B Customer Directory**:
   - Customer accounts (Dealerships, Fleet, Retail).
   - WhatsApp number with direct click-to-chat WhatsApp link icon.

---

## 4. Step 2: Supabase Connection & Automated Database Setup

> ⚡ **GOOD NEWS: ZERO MANUAL SQL REQUIRED!**  
> Because you are equipping Claude Code with the **Supabase MCP Server** and **Agent Skills**, **you do NOT need to manually copy-paste hundreds of lines of SQL into the Supabase dashboard**.  
> Claude Code will execute all database migrations, create the 8 tables, set up Row Level Security (RLS), deploy stored procedures, and configure the storage bucket automatically during Phase 1!

All you need to do is connect your project and grab your keys.

---

### 4.1 Your Supabase Project Details
- **Project Ref**: `sgdbhdmsvfmqxlpkrgez`
- **Project URL**: `https://sgdbhdmsvfmqxlpkrgez.supabase.co`

---

### 4.2 Copy Your 2 API Keys
1. Log into your project at [supabase.com](https://supabase.com).
2. In the Supabase left sidebar, click the **Settings gear icon** $\rightarrow$ **Data API** (or **API**).
3. Copy:
   - **anon (public)** key: Starts with `eyJhbGciOi...`
   - **service_role (secret)** key: Click **Reveal** to copy. Starts with `eyJhbGciOi...`

---

### 4.3 Connect Supabase MCP Server to Claude Code
Run these 3 commands in your PowerShell terminal to give Claude Code direct access to your database:

#### 1. Add the Supabase MCP Server
```powershell
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=sgdbhdmsvfmqxlpkrgez&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
```

#### 2. Authenticate the MCP Server
Open Claude in your terminal:
```powershell
claude /mcp
```
*(Select `supabase` $\rightarrow$ choose **Authenticate** in the terminal prompt to link your account).*

#### 3. Install Supabase Agent Skills
Install official Supabase agent skills so Claude Code has ready-made database recipes:
```powershell
npx skills add supabase/agent-skills
```

---

### 4.4 Turn Off Email Confirmation (For Fast Local Dev)
By default, Supabase requires users to click an email verification link before logging in. In local development, this slows you down:
1. In the Supabase left sidebar, click **Authentication** (person icon).
2. Under "Configuration", click **Providers** $\rightarrow$ **Email**.
3. Scroll down and **Turn OFF** `Confirm email`.
4. Click **Save**.
5. Under "Configuration", click **URL Configuration**:
   - Set **Site URL** to `http://localhost:3000`
   - Under **Redirect URLs**, add `http://localhost:3000/**`
   - Click **Save**.

🎉 **You are done with Supabase! Claude Code will handle the entire database build.**

---

## 5. Step 3: Populate Your `.env.local` File

The `.env.local` file has **already been created for you** directly in your project root!

1. Open [`.env.local`](file:///d:/SpicedProjects/Projects/productlogik-pos/.env.local) right here in your IDE.
2. It looks like this:
   ```env
   # -----------------------------------------------------------------------------
   # SUPABASE CONFIGURATION (Project Ref: sgdbhdmsvfmqxlpkrgez)
   # -----------------------------------------------------------------------------
   NEXT_PUBLIC_SUPABASE_URL=https://sgdbhdmsvfmqxlpkrgez.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # -----------------------------------------------------------------------------
   # APPLICATION URL
   # -----------------------------------------------------------------------------
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
3. Replace `your_supabase_anon_key_here` and `your_supabase_service_role_key_here` with your actual keys from your Supabase Dashboard (Step 4.2).
4. Save the file (`Ctrl + S`).
*(Note: `.env.local` is already in `.gitignore` so your keys will never be committed to Git).*

---

## 6. Step 4: Launching Claude Code & Starting Phase 1

You are now ready to unleash Claude Code to build your SaaS application!

### 6.1 Launch Claude Code in Your Project Root
1. In PowerShell, make sure you are in `d:\SpicedProjects\Projects\productlogik-pos`.
2. Start Claude Code by typing:
   ```powershell
   claude
   ```
3. Claude Code will initialize, index your repository, and present you with a prompt.

---

### 6.2 The Exact Kick-Off Prompt for Claude Code
Copy and paste this exact prompt into Claude Code:

```text
Hello! I am building a B2B SaaS POS & Quoting engine for automotive accessory sellers and retail shops (selling tint rolls, vinyl wraps, PPF, audio, and styling parts, with support for optional installation/labor services).

CRITICAL CONTEXT & RESOURCES:
1. Specification: All architectural requirements, schemas, and feature boundaries are strictly defined in PROJECT_SPEC.md.
2. UI Source of Truth: The complete visual layout, color palette, and interactive screens have already been designed in Figma and exported to `./design/figma-ui/`. Inspect `design/figma-ui/src/App.tsx` and `src/index.css` to port these exact designs into our Next.js App Router project!
3. Database & Supabase MCP: You are connected to Supabase project `sgdbhdmsvfmqxlpkrgez` (URL: https://sgdbhdmsvfmqxlpkrgez.supabase.co) via the Supabase MCP server and Agent Skills.

We will build this application in 6 sequential phases as outlined in Section 7 of PROJECT_SPEC.md.

YOUR INSTRUCTIONS FOR PHASE 1:
1. AUTOMATED DATABASE SETUP: Use your Supabase MCP tools to apply the database migrations and schema directly from PROJECT_SPEC.md Section 3.1 & 3.2 to project sgdbhdmsvfmqxlpkrgez. Deploy the atomic payment stored procedure from Section 3.3. Create the `shop-assets` public storage bucket. Verify that all 8 tables and functions exist. Do NOT ask the human to run SQL manually!
2. Initialize the Next.js App Router project (using TypeScript, Tailwind CSS, src/ directory, and import alias @/*).
3. Install the dependencies and shadcn/ui components listed in Phase 1.
4. Port the design tokens from `design/figma-ui/src/index.css` and the dashboard sidebar navigation from `design/figma-ui/src/App.tsx`.
5. Set up the Supabase browser and server clients (src/lib/supabase/) using the credentials in .env.local.
6. Build the Shop Registration (/register) and Login (/login) pages. Ensure registering a new shop creates both a `tenants` record and a linked `profiles` record with the admin role.
7. When Phase 1 is completely implemented and ready: STOP and PAUSE. Do not proceed to Phase 2. Provide clear, simple instructions for me to test the registration in my browser and wait for me to commit the code to git.

Please begin Phase 1 now.
```

---

## 7. Step 5: Testing & Git Commit Checklist (Phases 1 to 6)

During the build, keep **two PowerShell terminal windows** open:
- **Terminal 1**: Running `claude` (where you talk to Claude Code).
- **Terminal 2**: Running your local development server (`npm run dev`).

Whenever Claude Code finishes a phase, it will pause. Follow the exact testing steps below before typing in Terminal 1: `"Test passed! Proceed to Phase X"`.

---

### 📋 Phase 1 Testing: Authentication & Shop Registration
1. In Terminal 2, start the Next.js development server:
   ```powershell
   npm run dev
   ```
2. Open your browser and go to: `http://localhost:3000/register`.
3. Fill out the registration form:
   - **Shop Name**: `Apex Auto Accessories`
   - **Your Name**: `Marcus Vance`
   - **Email**: `marcus@apexaccessories.com`
   - **Password**: `TestPassword123!`
4. Click **"Register Shop"**.
5. **Verify in Supabase Dashboard**:
   - Open your Supabase Dashboard $\rightarrow$ **Table Editor**.
   - Check `tenants`: You should see a row for `Apex Auto Accessories`.
   - Check `profiles`: You should see a row for Marcus Vance with `role: admin` and a matching `tenant_id`.
6. **Save Your Progress in Git** (in Terminal 2):
   ```powershell
   git add .
   git commit -m "feat: phase 1 - foundation, supabase auth & multi-tenant rls"
   ```
7. Tell Claude Code: `"Phase 1 tested and committed. Proceed to Phase 2."`

---

### 📋 Phase 2 Testing: NHTSA Vehicle Data Ingestion
1. Claude Code will build `scripts/seed-vehicles.ts` and add `npm run seed:vehicles` to `package.json`.
2. In Terminal 2, run the seed script:
   ```powershell
   npm run seed:vehicles
   ```
3. Watch the terminal as it fetches makes and models (Toyota, Ford, Chevrolet, etc.) across years 2018–2026.
4. **Verify in Supabase**:
   - Go to Supabase $\rightarrow$ **Table Editor** $\rightarrow$ `vehicles`.
   - You should see hundreds of rows with Year, Make, Model!
5. **Save Your Progress in Git**:
   ```powershell
   git add .
   git commit -m "feat: phase 2 - nhtsa vehicle engine and seed pipeline"
   ```
6. Tell Claude Code: `"Phase 2 tested and committed. Proceed to Phase 3."`

---

### 📋 Phase 3 Testing: Inventory Engine (Universal Fit vs YMM)
1. Go to `http://localhost:3000/inventory`.
2. Click **"+ Add New Part"** and create Item #1 (Universal Fit):
   - **SKU**: `WF-CLEAN-01`
   - **Name**: `Slip Solution Window Tint Application Fluid`
   - **Category**: `Hardware / Chemicals`
   - **Cost**: `15.00` | **Selling Price**: `35.00`
   - **Stock**: `20` | **Threshold**: `5`
   - **Fitment**: Select **Universal Fit**
   - Click Save.
3. Click **"+ Add New Part"** and create Item #2 (Vehicle-Specific):
   - **SKU**: `AUDIO-F150-SUB`
   - **Name**: `Underseat Custom 10-inch Subwoofer Enclosure`
   - **Category**: `Car Audio`
   - **Cost**: `180.00` | **Selling Price**: `350.00`
   - **Stock**: `3` (Note: This is $\le 5$, so it should trigger a warning pill!)
   - **Fitment**: Select **Vehicle Specific** $\rightarrow$ Link to `2024 Ford F-150`.
   - Click Save.
4. **Visual Check**:
   - Verify Item #1 has an emerald **"Universal Fit"** badge.
   - Verify Item #2 has a blue **"Vehicle Specific"** badge and an amber/rose **"Low Stock: 3 left"** pill.
5. **Save Your Progress in Git**:
   ```powershell
   git add .
   git commit -m "feat: phase 3 - inventory engine & ymm compatibility"
   ```
6. Tell Claude Code: `"Phase 3 tested and committed. Proceed to Phase 4."`

---

### 📋 Phase 4 Testing: B2B Customer Directory & WhatsApp CRM
1. Go to `http://localhost:3000/customers`.
2. Click **"+ Register Customer"**:
   - **Company / Name**: `Premier Ford Dealership`
   - **Customer Type**: Select `Dealership`
   - **Contact Person**: `Sarah Jenkins`
   - **WhatsApp Number**: `+15551234567` (Test that it requires the `+` country code!).
   - **Email**: `parts@premierford.com`
   - Click Save.
3. Click on the customer name to open their profile. Verify that the WhatsApp number has a clickable WhatsApp icon that generates a `https://wa.me/...` link.
4. **Save Your Progress in Git**:
   ```powershell
   git add .
   git commit -m "feat: phase 4 - b2b customer directory"
   ```
5. Tell Claude Code: `"Phase 4 tested and committed. Proceed to Phase 5."`

---

### 📋 Phase 5 Testing: The Quoting Engine & Magic YMM Fitment Filter
1. Go to `http://localhost:3000/quotes/new`.
2. **Test the Magic Fit Filter**:
   - Select Customer: `Premier Ford Dealership`.
   - Select Vehicle: `2024` $\rightarrow$ `Ford` $\rightarrow$ `F-150`.
   - In the accessory picker table, verify:
     - ✅ The `Slip Solution` (Universal Item) **appears**.
     - ✅ The `F-150 Subwoofer Enclosure` (Compatible with F-150) **appears**.
   - Now change the vehicle dropdown to `2024 Toyota Camry`.
     - ✅ The `F-150 Subwoofer` **disappears**! Only universal parts remain. *This is your core competitive advantage!*
3. Switch back to the Ford F-150 and click **"+ Add to Quote"** for both items.
4. Click **"+ Add Optional Fitting / Labor Service"**:
   - Description: `Subwoofer Wiring & Audio Fitting Service`
   - Price: `150.00`
5. Verify the totals calculate correctly:
   - Subtotal updates in real time.
   - Enter a $20 discount.
   - Tax calculates based on your shop settings.
6. Click **"Save Draft"**.
7. **Save Your Progress in Git**:
   ```powershell
   git add .
   git commit -m "feat: phase 5 - quoting engine & magic fit filter"
   ```
8. Tell Claude Code: `"Phase 5 tested and committed. Proceed to Phase 6."`

---

### 📋 Phase 6 Testing: PDF Generation, WhatsApp & Inventory Deduction
1. Open the quote you just created (`/quotes/[id]`).
2. **Test 1: PDF Generation**:
   - Click **"Download PDF"** (or View PDF).
   - Verify the PDF renders cleanly with shop details, customer details, vehicle (2024 Ford F-150), itemized table with parts + labor, and total.
3. **Test 2: WhatsApp Share**:
   - Click **"Share to WhatsApp"**.
   - Verify it opens `https://wa.me/...` with a pre-composed message containing the quote number, vehicle name, and total.
4. **Test 3: Manual Payment & Atomic Stock Deduction**:
   - Note your current stock of `Underseat Custom 10-inch Subwoofer Enclosure` in `/inventory` (was 3).
   - On the quote page, click **"Mark as Paid"**.
   - Select Payment Method: `Bank Transfer`, enter reference: `WIRE-9821`.
   - Click Confirm.
   - The quote status should change to an emerald **"Paid"** badge.
   - Return to `http://localhost:3000/inventory`:
     - The stock for the subwoofer enclosure must now be **2** (automatically deducted by 1!).
   - Try clicking "Mark as Paid" again on the quote — verify the system rejects it because it was already deducted.
5. **Final MVP Git Commit**:
   ```powershell
   git add .
   git commit -m "feat: phase 6 - pdf generation, whatsapp dispatch & inventory deduction"
   ```

🎉 **Congratulations! Your Phase 1 MVP is Fully Built and Verified!**

---

## 8. Beginner Troubleshooting & Emergency Playbook

### Problem 1: "Port 3000 is already in use"
- **Cause**: Another development server or node process is running in the background.
- **Solution**: In PowerShell, run:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
  ```
  Then run `npm run dev` again.

---

### Problem 2: "Invalid API Key" or Supabase Connection Error
- **Cause**: Typo or extra whitespace in `.env.local`.
- **Solution**:
  1. Open `.env.local` and check that `NEXT_PUBLIC_SUPABASE_URL` begins with `https://`.
  2. Ensure there are no quotes around your keys (e.g. `NEXT_PUBLIC_SUPABASE_URL=https://...` NOT `="https://..."`).
  3. Restart the dev server (`Ctrl + C` in Terminal 2, then `npm run dev`).

---

### Problem 3: Claude Code gets stuck or produces an error
- **Solution**: Don't panic! Simply tell Claude Code:
  ```text
  I encountered this error in the terminal/browser:
  [Paste the exact error message here]
  Please inspect the relevant file and fix it without changing our PROJECT_SPEC.md requirements.
  ```

---

### Problem 4: How to use Antigravity (this IDE) alongside Claude Code
- Antigravity is your visual co-pilot. You can view all code files, see live diffs, and inspect your project tree while Claude Code runs in your terminal.
- If Claude Code creates files or modifies code, Antigravity will automatically sync and display the changes in real time.
- If you ever want Antigravity to write code or debug a file directly, simply ask in this chat!

---

## 9. Going Live: Superadmin Console & Two-Factor

The admin console is separate from the shops. Superadmins have their own accounts (no shop) and sign in at **`/admin/login`**, never at the shops' `/login`; a shop account can't sign in to the console and a superadmin account can't sign in to a shop (Login As still opens any shop from the console). Supabase allows one account per email, so a superadmin uses its own address: for Gmail, `name+admin@gmail.com` reaches the same inbox. After the password, the console asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password). Nothing in the code changes between localhost and production; these are the only things to check:

1. **Same Supabase project as now:** nothing to do. The authenticator you set up on localhost keeps working in production, because the factor is stored in Supabase, not in the app or the domain.
2. **A new Supabase project for production:** run the migrations as usual. In the Supabase dashboard, check **Authentication → Multi-Factor → Authenticator app (TOTP)** is enabled (it is by default). Create the first superadmin account (Claude Code can do it: the console's Team page needs a superadmin to add others), then on the first sign-in at `/admin/login` you scan a new QR code once.
3. **Don't lock yourself out:** make a second person a superadmin (Admin → Team), or keep the "Can't scan? Enter this key" text from setup somewhere safe (password manager). If the only superadmin loses their phone: Supabase dashboard → Authentication → Users → the user → remove the MFA factor, then sign in and scan a new QR code. Another superadmin can do the same from Admin → Team → Reset two-factor.
4. **Phone clock:** codes depend on the time. If a correct-looking code is refused, set the phone's time to automatic.
5. **Email (during or after deployment):** Resend stays in test mode until then, so emails only reach hamzi207@gmail.com. At go-live, verify your domain in Resend (Domains → Add domain, then add the DNS records it shows) and set `RESEND_FROM_EMAIL` (e.g. `ProductLogik POS <billing@yourdomain.com>`) in the production environment. After that, invitations, category request emails and subscription reminders reach every address.

---

## 🏁 Your Immediate Next Move
1. Open [`.env.local`](file:///d:/SpicedProjects/Projects/productlogik-pos/.env.local) right here in your IDE, paste your 2 API keys from Supabase, and press `Ctrl + S`.
2. In your PowerShell terminal, run:
   ```powershell
   claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=sgdbhdmsvfmqxlpkrgez&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
   claude /mcp
   ```
   *(Select `supabase` and choose Authenticate).*
3. Install the Supabase Agent Skills:
   ```powershell
   npx skills add supabase/agent-skills
   ```
4. Start Claude Code:
   ```powershell
   claude
   ```
5. Paste the kick-off prompt from **Section 6.2**. Claude Code will automatically execute the database migrations, set up RLS, deploy the stored procedure, and build Phase 1!
