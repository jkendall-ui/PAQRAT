import { useState } from 'react';
import { M3Card } from '../components/m3/M3Card';
import { M3Button } from '../components/m3/M3Button';
import { M3TextField } from '../components/m3/M3TextField';
import { useAuth } from '../context/AuthContext';

export function AdminMediaPage() {
  const { token } = useAuth();
  const [altText, setAltText] = useState('');
  const [attribution, setAttribution] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altError, setAltError] = useState(false);
  const [attrError, setAttrError] = useState(false);

  async function handleUpload() {
    setError(null); setSuccess(null);
    setAltError(!altText.trim()); setAttrError(!attribution.trim());
    if (!altText.trim() || !attribution.trim()) return;
    if (!file) { setError('Please select a file'); return; }
    setUploading(true);
    try {
      const urlRes = await fetch('/api/admin/media/upload-url', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type }) });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, publicUrl } = await urlRes.json();
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const mediaRes = await fetch('/api/admin/media', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicUrl, type: file.type.startsWith('image/') ? 'image' : 'other', altText: altText.trim(), attribution: attribution.trim() }) });
      if (!mediaRes.ok) throw new Error('Failed to create media record');
      setSuccess('Media uploaded successfully'); setAltText(''); setAttribution(''); setFile(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setUploading(false); }
  }

  return (
    <div className="p-4 space-y-4" data-testid="admin-media">
      <h1 className="text-2xl font-semibold text-gray-900">Media Management</h1>
      <M3Card variant="outlined">
        <div className="space-y-3" data-testid="media-upload-form">
          <div>
            <label htmlFor="media-file" className="text-xs text-gray-500 block mb-1">File</label>
            <input id="media-file" type="file" accept="image/*,audio/*,video/*" data-testid="media-file-input" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <M3TextField label="Alt Text" value={altText} onChange={e => { setAltText(e.target.value); setAltError(false); }} error={altError} errorText="Alt text is required" data-testid="alt-text-input" />
          <M3TextField label="Attribution" value={attribution} onChange={e => { setAttribution(e.target.value); setAttrError(false); }} error={attrError} errorText="Attribution is required" data-testid="attribution-input" />
          <M3Button variant="filled" onClick={handleUpload} disabled={uploading} data-testid="upload-media-btn">{uploading ? 'Uploading...' : 'Upload Media'}</M3Button>
        </div>
      </M3Card>
      {success && (<div className="p-3 rounded-md bg-green-50 text-green-800" data-testid="upload-success">{success}</div>)}
      {error && (<div className="p-3 rounded-md bg-red-50 text-red-800" data-testid="upload-error">{error}</div>)}
    </div>
  );
}
