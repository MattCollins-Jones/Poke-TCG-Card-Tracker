import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import setsRouter from './routes/sets.js';
import cardsRouter from './routes/cards.js';
import collectionRouter from './routes/collection.js';
import syncRouter from './routes/sync.js';
import { isSyncNeeded, syncAllData } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/sets', setsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/collection', collectionRouter);
app.use('/api/sync', syncRouter);

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Auto-sync on startup if DB is empty or data is older than 7 days
  if (isSyncNeeded()) {
    console.log('[sync] Database needs syncing, starting background sync…');
    syncAllData({ onProgress: (msg) => console.log('[sync]', msg) })
      .then(({ sets, cards }) => console.log(`[sync] Done: ${sets} sets, ${cards} cards`))
      .catch((err) => console.error('[sync] Error:', err.message));
  } else {
    console.log('[sync] Database is up to date, skipping sync.');
  }
});
