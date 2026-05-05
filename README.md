# 🎴 Pokémon Card Tracker

Track your Pokémon TCG collection — browse every set and card, mark what you own, log quantity + condition, and keep a wishlist.

## Tech Stack
- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: SQLite (`better-sqlite3`)
- **Card Data**: [Pokémon TCG API](https://pokemontcg.io)

---

## Setup

### 1. Get a free API key
Register at [pokemontcg.io](https://pokemontcg.io) for a free API key (gives ~20,000 requests/day).

### 2. Configure the server
```bash
cd server
cp .env.example .env
# Edit .env and add your API key
```

### 3. Install dependencies
```bash
# From the root pokemon-tracker folder:
cd server && npm install
cd ../client && npm install
```

### 4. Run
Open two terminals:

**Terminal 1 — Server:**
```bash
cd server
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev
# Opens http://localhost:5173
```

---

## Features
- 📦 **Browse Sets** — all TCG sets grouped by series, searchable
- 🃏 **Cards in Set** — full card grid with images; filter by All / Owned / Not Owned / Wishlist
- ✅ **My Collection** — all owned cards across sets, filterable by condition, with set completion stats
- ⭐ **Wishlist** — cards you want, grouped by set
- ✏️ **Card Modal** — set quantity, condition (Mint/Good/Played/Poor), wishlist toggle, and notes per card

---

## Database
SQLite file is stored at `server/collection.db` (auto-created on first run). Back this file up to save your collection.
