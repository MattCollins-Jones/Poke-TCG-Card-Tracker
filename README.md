# 🎴 Pokémon TCG Tracker

A full-stack web app to track your Pokémon Trading Card Game collection — browse every set and card, mark what you own, log quantity and condition, keep a wishlist, and view live market prices.

Card data syncs automatically from [TCGdex](https://tcgdex.dev) (free, no API key required). Market prices are sourced from Cardmarket (EUR) and TCGPlayer (USD) and can be displayed in GBP, EUR, or USD.

**Live at:** your Vercel deployment URL

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (SPA) |
| Serverless API | Vercel Functions (Node.js 18) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Image Storage | Supabase Storage (`pokemon-images` bucket) |
| Card Data | [TCGdex API](https://tcgdex.dev) |
| Market Prices | TCGdex pricing endpoint (Cardmarket / TCGPlayer) |
| Currency Rates | [open.er-api.com](https://open.er-api.com) (client-side, free) |
| Hosting | Vercel (frontend + API) |

---

## Features

- 📦 **Browse Sets** — all TCG sets with logo/symbol images, grouped by series and searchable
- 🃏 **Cards in Set** — full card grid with images; filter by All / Owned / Not Owned / Wishlist
- 🔍 **Card Modal** — set quantity, condition (Mint / Good / Played / Poor), wishlist toggle, notes, and market prices
- 🖼️ **Image Lightbox** — click any card image in the modal to see a full-size view of the artwork
- 💰 **Market Prices** — Cardmarket and TCGPlayer prices shown per card (synced weekly)
- 💱 **Currency Selector** — choose GBP, EUR, or USD in the navbar; preference saved per browser
- ✅ **My Collection** — all owned cards across sets, filterable by condition, with per-set completion stats
- ⭐ **Wishlist** — cards you want, grouped by set
- 🔄 **Data Sync** — admin-only page to pull the latest sets and cards from TCGdex in batches
- ⚙️ **Admin Panel** — manage set/card visibility, edit images, add custom sets and cards, upload images directly

---

## Deployment

This project is designed to run on **Vercel** with a **Supabase** backend. There is no traditional server to run — the API layer is entirely Vercel serverless functions.

### 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the database schema (see [Database Schema](#database-schema) below)
3. Go to **Storage → New bucket**, name it `pokemon-images`, and enable **Public bucket**
4. Note your **Project URL**, **anon key**, and **service role key** from Project Settings → API

### 2. Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo in [vercel.com](https://vercel.com) — Vercel auto-detects the config from `vercel.json`
3. Add the following environment variables in the Vercel dashboard:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) |
| `ADMIN_EMAIL` | Email address of the admin user |
| `SYNC_SECRET` | Random secret string for cron-triggered syncs |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` (exposed to frontend) |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` (exposed to frontend) |

4. Deploy — Vercel will build the React app and wire up the API automatically

### 3. Initial data sync

Once deployed, log in as the admin user and navigate to **Sync** to pull all sets and cards from TCGdex. Cards sync in batches of 1000 — click **Continue** after each batch until complete.

After the card sync, run a **Price Sync** to fetch initial market pricing data.

The sync also runs automatically on the **1st of each month at 03:00 UTC** via Vercel Crons.

---

## Local Development

```bash
# Install dependencies
cd client && npm install && cd ..
npm install        # root (Vercel dev tooling)

# Copy env file and fill in your Supabase credentials
cp .env.example .env

# Run locally (Vercel dev emulates serverless functions)
npx vercel dev
```

The app will be available at `http://localhost:3000`. The API functions in `api/` run as simulated serverless functions on the same port.

---

## Database Schema

Run the following SQL in your Supabase project's **SQL Editor** to create the required tables:

```sql
-- Sets
create table sets (
  id            text primary key,
  name          text not null,
  series        text,
  release_date  date,
  total         int,
  printed_total int,
  logo_image    text,
  symbol_image  text,
  hidden        boolean default false
);

-- Cards
create table cards (
  id                  text primary key,
  set_id              text references sets(id),
  name                text,
  number              text,
  rarity              text,
  subtypes            text[],
  variants            jsonb,
  small_image         text,
  large_image         text,
  hidden              boolean default false,
  -- Cardmarket pricing (EUR)
  cm_trend            numeric,
  cm_avg30            numeric,
  cm_low              numeric,
  cm_trend_holo       numeric,
  cm_avg30_holo       numeric,
  -- TCGPlayer pricing (USD)
  tcp_normal_market   numeric,
  tcp_normal_low      numeric,
  tcp_reverse_market  numeric,
  price_updated_at    timestamptz
);

-- User collection entries
create table collection (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  card_id    text references cards(id),
  quantity   int default 1,
  condition  text default 'Mint',
  wishlist   boolean default false,
  notes      text,
  created_at timestamptz default now(),
  unique(user_id, card_id)
);

-- Sync state
create table sync_meta (
  key   text primary key,
  value text
);

-- Row-level security (enable on all tables)
alter table sets        enable row level security;
alter table cards       enable row level security;
alter table collection  enable row level security;
alter table sync_meta   enable row level security;

-- Public read access for sets and cards
create policy "Public read sets"  on sets  for select using (true);
create policy "Public read cards" on cards for select using (true);

-- Users can only access their own collection
create policy "Own collection" on collection
  for all using (auth.uid() = user_id);

-- sync_meta: service role only (no anon access needed)
```

---

## Project Structure

```
pokemon-tracker/
├── api/                        # Vercel serverless functions
│   ├── admin/
│   │   ├── cards/index.js      # GET/POST/PATCH/DELETE cards (admin)
│   │   ├── sets/index.js       # GET/POST/PATCH sets (admin)
│   │   ├── cards/[id].js       # PATCH/DELETE single card
│   │   ├── sets/[id].js        # PATCH single set
│   │   └── upload.js           # Signed Supabase Storage upload URL
│   ├── auth/
│   │   └── me.js               # Returns current user + admin flag
│   ├── collection/
│   │   └── index.js            # GET/POST/PATCH/DELETE collection entries
│   ├── sets/
│   │   └── index.js            # Public sets list
│   ├── cards/
│   │   └── index.js            # Public cards list (by set)
│   ├── prices/
│   │   └── index.js            # Card prices endpoint
│   ├── sync/
│   │   └── index.js            # TCGdex sync (sets / cards / prices phases)
│   └── lib/
│       ├── supabase.js         # Supabase client factory
│       └── apiFetch.js         # Authenticated fetch helper
├── client/                     # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── SetsPage.jsx
│       │   ├── CardsPage.jsx
│       │   ├── CollectionPage.jsx
│       │   ├── WishlistPage.jsx
│       │   ├── SyncPage.jsx
│       │   ├── AdminPage.jsx
│       │   └── LoginPage.jsx
│       ├── components/
│       │   ├── CardModal.jsx   # Card detail modal with pricing + lightbox
│       │   ├── NavBar.jsx      # Navigation + currency selector
│       │   └── ImageUpload.jsx # URL input + file upload to Supabase Storage
│       ├── context/
│       │   └── CurrencyContext.jsx  # Currency preference + rate conversion
│       └── lib/
│           ├── supabase.js     # Client-side Supabase instance
│           └── apiFetch.js     # Auth-aware fetch wrapper
├── vercel.json                 # Vercel build + routing + cron config
└── .env.example                # Environment variable template
```

---

## Notes

- **Admin access** is gated by matching the logged-in user's email to the `ADMIN_EMAIL` environment variable (server-side check)
- **Image uploads** go directly from the browser to Supabase Storage via a server-generated signed URL — no file data passes through the serverless function
- **Vercel Hobby plan** supports up to 12 serverless functions; this project uses exactly 12
- **Sync timeout**: Vercel Hobby functions have a 60-second max duration (configured in `vercel.json`). The sync is split into phases and batches to stay within this limit
- **Currency rates** are fetched client-side on page load from `open.er-api.com` — no API key needed, no server call used
