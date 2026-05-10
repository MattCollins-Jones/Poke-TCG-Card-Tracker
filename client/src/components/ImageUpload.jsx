import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { apiFetch } from '../lib/apiFetch.js';

const BUCKET = 'pokemon-images';

/**
 * ImageUpload — URL text field + 📎 file upload button.
 * Uploads to Supabase Storage via a server-side signed URL.
 * @param {string}   value       Current URL value
 * @param {Function} onChange    Called with the new URL string
 * @param {string}   folder      Storage subfolder (e.g. "sets", "cards")
 * @param {boolean}  showPreview Show image preview below the field
 */
export default function ImageUpload({ value, onChange, folder = 'uploads', showPreview = false }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const filename = `${folder}/${Date.now()}.${ext}`;

      const res = await apiFetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, contentType: file.type }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(result.path, result.token, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;

      onChange(result.publicUrl);
    } catch (err) {
      setError(err.message ?? 'Upload failed');
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="image-upload-field">
      <div className="image-upload-row">
        <input
          type="url"
          className="admin-input admin-url-input"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="https://… or use 📎 to upload"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="admin-upload-btn"
          onClick={() => fileRef.current.click()}
          disabled={uploading}
          title="Upload an image file"
        >
          {uploading ? '⏳' : '📎'}
        </button>
      </div>
      {error && <div className="admin-err" style={{ fontSize: '0.75rem', marginTop: 3 }}>{error}</div>}
      {showPreview && value && (
        <img
          src={value}
          alt="preview"
          className="admin-upload-preview"
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
    </div>
  );
}
