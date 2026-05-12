import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorker } from 'tesseract.js';
import { apiFetch } from '../lib/apiFetch.js';

// How many consecutive matching reads before we accept the result
const CONFIRM_THRESHOLD = 2;
// OCR interval in ms
const SCAN_INTERVAL = 700;

// Extract set code (2-5 uppercase letters) and card number from OCR text.
// Pokemon card bottom-right typically has something like: SCR 121/142
// or the code and number may appear on separate lines.
function parseCardText(text) {
  // Normalise: collapse whitespace, uppercase
  const normalised = text.replace(/\s+/g, ' ').toUpperCase();

  // Match a number/total pattern — the number before the slash is what we want
  const numMatch = normalised.match(/\b(\d{1,3})\/(\d{1,3})\b/);
  if (!numMatch) return null;
  const cardNumber = numMatch[1];

  // Look for a 2–5 letter uppercase set code near the number
  // Try: code directly before or after the number string
  const codeMatch = normalised.match(/\b([A-Z]{2,5})\b/g);
  if (!codeMatch || codeMatch.length === 0) return null;

  // Filter out common English words that aren't set codes
  const STOP_WORDS = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'ARE', 'WAS', 'NOT', 'YOU', 'YOUR', 'ALL', 'HAVE', 'WILL', 'BEEN', 'THEY', 'CAN']);
  const candidates = codeMatch.filter((w) => !STOP_WORDS.has(w));
  if (candidates.length === 0) return null;

  // Prefer candidates that appear closest to the number pattern in the string
  const numIdx = normalised.indexOf(numMatch[0]);
  let bestCode = null;
  let bestDist = Infinity;
  for (const code of candidates) {
    const idx = normalised.indexOf(code);
    const dist = Math.abs(idx - numIdx);
    if (dist < bestDist) {
      bestDist = dist;
      bestCode = code;
    }
  }

  return bestCode ? { setCode: bestCode, cardNumber } : null;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const scanTimerRef = useRef(null);
  const streamRef = useRef(null);
  const lastMatchRef = useRef(null);
  const matchCountRef = useRef(0);

  const [status, setStatus] = useState('starting'); // starting | scanning | found | error | permission-denied
  const [ocrText, setOcrText] = useState('');
  const [matchPreview, setMatchPreview] = useState(null); // { card, set } from API
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);

  const stopScan = useCallback(() => {
    clearInterval(scanTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const handleFound = useCallback(async ({ setCode, cardNumber }) => {
    clearInterval(scanTimerRef.current);
    setStatus('found');
    try {
      const res = await apiFetch(`/api/cards/lookup?ptcgoCode=${encodeURIComponent(setCode)}&number=${encodeURIComponent(cardNumber)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `Card not found (${setCode} #${cardNumber})`);
        setStatus('error');
        return;
      }
      const data = await res.json();
      setMatchPreview(data);
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }, []);

  const doScan = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !worker || video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Crop to bottom 30% of the frame — that's where set code + number live
    const cropH = Math.floor(vh * 0.30);
    const cropY = vh - cropH;

    canvas.width = vw;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, cropY, vw, cropH, 0, 0, vw, cropH);

    // Boost contrast to help Tesseract
    ctx.filter = 'contrast(1.4) brightness(1.1)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';

    try {
      const { data: { text } } = await worker.recognize(canvas);
      setOcrText(text.trim());

      const parsed = parseCardText(text);
      if (!parsed) {
        lastMatchRef.current = null;
        matchCountRef.current = 0;
        return;
      }

      const key = `${parsed.setCode}:${parsed.cardNumber}`;
      if (key === lastMatchRef.current) {
        matchCountRef.current += 1;
      } else {
        lastMatchRef.current = key;
        matchCountRef.current = 1;
      }

      if (matchCountRef.current >= CONFIRM_THRESHOLD) {
        await handleFound(parsed);
      }
    } catch {
      // OCR errors are transient — just keep scanning
    }
  }, [handleFound]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // rear camera on mobile
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const worker = await createWorker('eng', 1, {
          logger: () => {}, // silence progress logs
        });
        if (cancelled) { worker.terminate(); return; }
        workerRef.current = worker;

        setStatus('scanning');
        scanTimerRef.current = setInterval(doScan, SCAN_INTERVAL);
      } catch (err) {
        if (cancelled) return;
        if (err.name === 'NotAllowedError') {
          setStatus('permission-denied');
        } else {
          setErrorMsg(err.message);
          setStatus('error');
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      stopScan();
    };
  }, [doScan, stopScan]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      // Torch not supported on this device
    }
  };

  const goToCard = () => {
    if (!matchPreview) return;
    stopScan();
    navigate(`/sets/${matchPreview.set.id}`, { state: { scanCardId: matchPreview.card.id } });
  };

  const rescan = () => {
    setMatchPreview(null);
    setOcrText('');
    setErrorMsg('');
    lastMatchRef.current = null;
    matchCountRef.current = 0;
    setStatus('scanning');
    scanTimerRef.current = setInterval(doScan, SCAN_INTERVAL);
  };

  return (
    <div className="scan-page">
      <div className="scan-header">
        <button className="back-btn" onClick={() => { stopScan(); navigate(-1); }}>← Back</button>
        <h2 className="scan-title">📷 Scan a Card</h2>
        <button className="scan-torch-btn" onClick={toggleTorch} title="Toggle torch">
          {torchOn ? '🔦' : '💡'}
        </button>
      </div>

      <div className="scan-viewport">
        <video ref={videoRef} className="scan-video" playsInline muted />
        {/* Guide overlay */}
        <div className="scan-overlay">
          <div className="scan-guide-box">
            <span className="scan-guide-corner tl" />
            <span className="scan-guide-corner tr" />
            <span className="scan-guide-corner bl" />
            <span className="scan-guide-corner br" />
          </div>
          <div className="scan-guide-label">Point camera at bottom-right of card</div>
        </div>

        {/* Status badge */}
        {status === 'scanning' && (
          <div className="scan-badge scanning">🔍 Scanning…</div>
        )}
        {status === 'starting' && (
          <div className="scan-badge">⏳ Starting camera…</div>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* OCR debug text (shown while scanning) */}
      {status === 'scanning' && ocrText && (
        <div className="scan-debug">
          <span className="scan-debug-label">Detected text:</span>
          <span className="scan-debug-text">{ocrText.slice(0, 120)}</span>
        </div>
      )}

      {/* Permission denied */}
      {status === 'permission-denied' && (
        <div className="scan-result-panel error">
          <div className="scan-result-icon">🚫</div>
          <div className="scan-result-msg">Camera access was denied. Please allow camera access in your browser settings and try again.</div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="scan-result-panel error">
          <div className="scan-result-icon">⚠️</div>
          <div className="scan-result-msg">{errorMsg || 'Something went wrong.'}</div>
          <button className="scan-action-btn" onClick={rescan}>Try again</button>
        </div>
      )}

      {/* Found */}
      {status === 'found' && matchPreview && (
        <div className="scan-result-panel success">
          <div className="scan-result-icon">✅</div>
          <div className="scan-result-name">{matchPreview.card.name}</div>
          <div className="scan-result-meta">
            {matchPreview.set.name} · #{matchPreview.card.number}
            {matchPreview.card.rarity && ` · ${matchPreview.card.rarity}`}
          </div>
          {matchPreview.card.images?.small && (
            <img className="scan-result-img" src={matchPreview.card.images.small} alt={matchPreview.card.name} />
          )}
          <div className="scan-result-actions">
            <button className="scan-action-btn primary" onClick={goToCard}>View Card →</button>
            <button className="scan-action-btn" onClick={rescan}>Scan Another</button>
          </div>
        </div>
      )}

      {/* Loading state while looking up */}
      {status === 'found' && !matchPreview && !errorMsg && (
        <div className="scan-result-panel">
          <div className="scan-result-msg">Looking up card…</div>
        </div>
      )}

      <div className="scan-instructions">
        <p>Hold the card steady so the bottom of the card is visible. The app will automatically detect the set and card number.</p>
      </div>
    </div>
  );
}
