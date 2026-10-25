# MacBook Setup & Cross-Platform Development Guide (Windows ⇄ Mac)

> **Quick Answer:** If you clone this repository onto your MacBook right now, you **cannot** immediately start working without running through a few required setup steps and pre-flight checks. 
> 
> Because `.env.local` is gitignored, your Windows machine has uncommitted/untracked changes, and the project relies on specific Node.js 22+ runtime flags, you must follow the checklist below before running the dev server.

---

## Table of Contents
1. [Why You Can't Just "Clone & Run" (Key Differences)](#1-why-you-cant-just-clone--run-key-differences)
2. [Step 0: Pre-Flight Check on Windows (Do This First!)](#2-step-0-pre-flight-check-on-windows-do-this-first)
3. [Step 1: First-Time Machine Setup on Your MacBook](#3-step-1-first-time-machine-setup-on-your-macbook)
4. [Step 2: Cloning & Project Initialization on Mac](#4-step-2-cloning--project-initialization-on-mac)
5. [Step 3: Verification & Sanity Checks](#5-step-3-verification--sanity-checks)
6. [Daily Switching Protocol (Windows ⇄ Mac Cheat Sheet)](#6-daily-switching-protocol-windows--mac-cheat-sheet)
7. [Troubleshooting & Common Cross-Platform Gotchas](#7-troubleshooting--common-cross-platform-gotchas)

---

## 1. Why You Can't Just "Clone & Run" (Key Differences)

| Category | Windows | macOS (MacBook) | What You Must Do |
| :--- | :--- | :--- | :--- |
| **Local Secrets (`.env.local`)** | Exists locally | **Missing on clone** (gitignored) | Copy your `.env.local` from Windows to Mac securely. |
| **Node.js Version** | Often whatever installer ran | Requires **Node.js >= 22.6.0** (LTS 22 recommended) | `npm run seed:vehicles` uses `--experimental-strip-types` and `--env-file`, requiring Node 22+. Older Node 18 or 20 will fail. |
| **Line Endings (CRLF vs LF)** | Windows defaults to CRLF (`\r\n`) | macOS uses LF (`\n`) | Enforced via [.gitattributes](file:///d:/SpicedProjects/Projects/productlogik-pos/.gitattributes) and `git config --global core.autocrlf input`. |
| **Architecture** | x64 | Apple Silicon (`arm64` - M1/M2/M3/M4) | Run native arm64 Node.js, not x86 under Rosetta, for best Turbopack & build speeds. |
| **Dependencies** | Pre-compiled Windows binaries | Darwin native binaries | Always run `npm ci` (clean install from `package-lock.json`). |
| **Uncommitted Work** | Active working directory | Only sees what has been pushed to GitHub | Commit & push from Windows before cloning/pulling on Mac. |

---

## 2. Step 0: Pre-Flight Check on Windows (Do This First!)

Before leaving your Windows machine, ensure your remote GitHub repository has everything you need.

### 2.1 Check for Uncommitted Changes
Open PowerShell on Windows and run:
```powershell
cd d:\SpicedProjects\Projects\productlogik-pos
git status
```

If you see modified or untracked files (e.g. `src/`, `supabase/migrations/`, etc.):
```powershell
git add .
git commit -m "chore: sync latest progress before switching to mac"
git push origin main
```
> [!WARNING]
> If you do not push your local changes, your MacBook will only clone the older commit that is currently on GitHub.

### 2.2 Securely Transfer Your `.env.local`
Your `.env.local` file contains Supabase keys and cannot be committed to Git.
Transfer this file to your MacBook securely (via AirDrop, encrypted notes, 1Password, or copy-paste).

Your `.env.local` should have at least:
```env
NEXT_PUBLIC_SUPABASE_URL=https://sgdbhdmsvfmqxlpkrgez.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Optional (needed if running npm run db:push or npm run db:types):
# SUPABASE_DB_URL=postgresql://postgres.sgdbhdmsvfmqxlpkrgez:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

---

## 3. Step 1: First-Time Machine Setup on Your MacBook

Perform these one-time system checks on your MacBook terminal (`Terminal.app` or `iTerm2`).

### 3.1 Install Apple Command Line Tools
Required for native C/C++ compilation (used by some node modules like native canvas, PDF, or Turbopack utilities):
```bash
xcode-select --install
```
*(If already installed, this will say it is already up to date).*

### 3.2 Install & Verify Node.js 22 LTS
This project includes a [.nvmrc](file:///d:/SpicedProjects/Projects/productlogik-pos/.nvmrc) requiring **Node.js 22**.

Check your current version:
```bash
node -v
```
- **If `v22.6.0` or higher (e.g., `v22.14.0`)**: You are ready!
- **If `v18.x`, `v20.x`, or missing**: Install Node 22 via Homebrew or NVM:

**Option A (Using NVM - Recommended):**
```bash
# If you use nvm:
nvm install 22
nvm use 22
nvm alias default 22
```

**Option B (Using Homebrew):**
```bash
brew install node@22
brew link --overwrite --force node@22
```

Verify architecture (should return `arm64` on Apple Silicon Macs):
```bash
node -p "process.arch"
# Expected output: arm64
```

### 3.3 Set Git Line Endings on macOS
To prevent Git from marking files as dirty due to Windows CRLF vs macOS LF differences:
```bash
git config --global core.autocrlf input
```
*(The repository also has a `.gitattributes` file enforcing `* text=auto eol=lf`).*

---

## 4. Step 2: Cloning & Project Initialization on Mac

### 4.1 Clone the Repository
```bash
# Choose your preferred directory (e.g. ~/Projects)
mkdir -p ~/Projects
cd ~/Projects

git clone https://github.com/hamzi207/productlogik-pos.git
cd productlogik-pos
```

### 4.2 Place Your `.env.local`
Create the file in the project root:
```bash
touch .env.local
nano .env.local    # or use VS Code: code .env.local
```
Paste your environment variables and save.

### 4.3 Install Dependencies
Always use `npm ci` instead of `npm install` for an initial clone. This guarantees you get the exact lockfile dependencies:
```bash
npm ci
```

---

## 5. Step 3: Verification & Sanity Checks

Run these 4 checks to verify that everything works cleanly on your MacBook:

### Check 1: TypeScript & Build Validation
```bash
npm run build
```
*Expected result:* Successful Next.js build with static route generation and zero TypeScript errors.

### Check 2: Launch the Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in Safari or Chrome. Verify:
- Navigation bar loads.
- Dashboard renders.
- Theme switching (Light / Dark) works.

### Check 3: Check Supabase Connectivity & Types
```bash
npm run db:types
```
*(If `SUPABASE_DB_URL` is set in `.env.local`, this fetches the latest schema definitions).*

### Check 4: Test Node Built-in TS Runner (`seed:vehicles`)
Run the script in dry-run mode (makes zero database writes):
```bash
npm run seed:vehicles -- --dry-run
```
*Expected result:* Fetches test models from NHTSA API and prints dry-run output without throwing any `--experimental-strip-types` flags error.

---

## 6. Daily Switching Protocol (Windows ⇄ Mac Cheat Sheet)

When switching back and forth frequently, follow this quick 3-step discipline to avoid merge conflicts and stale states:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│         WINDOWS MACHINE         │       │          MACBOOK                │
│                                 │       │                                 │
│ 1. git status                   │       │ 1. git pull origin main         │
│ 2. git add . && git commit      │ ───►  │ 2. npm ci (if deps changed)     │
│ 3. git push origin main         │       │ 3. npm run dev                  │
└─────────────────────────────────┘       └─────────────────────────────────┘
                 ▲                                         │
                 │                                         │
                 │        ┌────────────────────────┐       │
                 └─────── │ 1. git status          │ ◄─────┘
                          │ 2. git commit && push  │
                          └────────────────────────┘
```

### 1. When Finishing Work on Machine A:
```bash
git status
git add .
git commit -m "feat/fix: describe changes"
git push origin <branch-name>
```

### 2. When Resuming Work on Machine B:
```bash
git status               # Make sure working directory is clean
git pull origin <branch-name>
npm ci                   # Run if package.json or package-lock.json changed
npm run dev
```

### 3. If You Modified the Supabase Database:
- If you ran `npm run db:push` on Windows, the remote database updated.
- On Mac, simply pull the code and run `npm run db:types` if you need to regenerate types.
- Both machines connect to the **same remote Supabase project** (`sgdbhdmsvfmqxlpkrgez`), so your database data remains synchronized automatically!

---

## 7. Troubleshooting & Common Cross-Platform Gotchas

### Gotcha 1: `node: bad option: --experimental-strip-types`
- **Cause:** Your Mac is running Node.js 18 or 20. Strip types was added in Node v22.6.0.
- **Fix:** Run `node -v`. Upgrade to Node 22 (`nvm install 22 && nvm use 22`).

### Gotcha 2: Port 3000 is already in use
- **Cause:** macOS AirPlay receiver or another background dev server might use port 3000.
- **Fix:** Next.js will usually ask to switch to port 3001 automatically. If you want to free port 3000:
  ```bash
  lsof -ti :3000 | xargs kill -9
  ```

### Gotcha 3: Git shows hundreds of modified files with `^M` or line ending differences
- **Cause:** Windows CRLF line endings were checked out or committed without normalization.
- **Fix:** We added [.gitattributes](file:///d:/SpicedProjects/Projects/productlogik-pos/.gitattributes). Normalize existing files on your Mac by running:
  ```bash
  git add --renormalize .
  git status
  ```

### Gotcha 4: Supabase MCP / Claude Code on Mac
If you use Claude Code or Antigravity on your MacBook:
1. Ensure the Claude CLI is installed: `npm install -g @anthropic-ai/claude-code` (or install via official script).
2. Authenticate the Supabase MCP server on Mac:
   ```bash
   claude /mcp
   ```
   Select `supabase` and authorize your browser session as documented in [docs/supabase-mcp-setup.md](file:///d:/SpicedProjects/Projects/productlogik-pos/docs/supabase-mcp-setup.md).

### Gotcha 5: File Path & Casing Sensitivity
- Both Windows NTFS and macOS APFS are case-preserving and case-insensitive by default.
- However, Git can track casing mismatches. Always keep component imports matching the exact file name (e.g., `import { AppSidebar } from "@/components/shared/app-sidebar"` with kebab-case filenames).
