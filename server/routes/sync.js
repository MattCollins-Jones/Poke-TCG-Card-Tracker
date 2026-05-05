import express from 'express';
import { syncAllData, getLastSyncTime, isSyncNeeded } from '../sync.js';

const router = express.Router();

let syncInProgress = false;
let syncLog = [];

// GET /api/sync/status
router.get('/status', (req, res) => {
  res.json({
    inProgress: syncInProgress,
    lastSync: getLastSyncTime(),
    needsSync: isSyncNeeded(),
    log: syncLog.slice(-5),
  });
});

// POST /api/sync/start
router.post('/start', async (req, res) => {
  if (syncInProgress) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }
  syncInProgress = true;
  syncLog = ['Starting sync…'];
  res.json({ started: true });

  // Run sync in background (don't await — response already sent)
  syncAllData({
    onProgress: (msg) => {
      console.log('[sync]', msg);
      syncLog.push(msg);
      if (syncLog.length > 100) syncLog.shift();
    },
  })
    .then(({ sets, cards }) => {
      syncLog.push(`✅ Done: ${sets} sets, ${cards} cards`);
      syncInProgress = false;
    })
    .catch((err) => {
      syncLog.push(`❌ Error: ${err.message}`);
      syncInProgress = false;
    });
});

export default router;
