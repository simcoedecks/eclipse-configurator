import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, storage, storageRef, uploadBytes, getDownloadURL } from '../../../shared/firebase';
import { addFileRecord, deleteFileRecord } from '../../lib/crmHelpers';
import { FileText, Image as ImageIcon, Upload, Trash2, Download, Loader2 } from 'lucide-react';

interface Props { submissionId: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(contentType: string) {
  if (contentType?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-600" />;
  if (contentType === 'application/pdf') return <FileText className="w-4 h-4 text-rose-600" />;
  return <FileText className="w-4 h-4 text-slate-500" />;
}

export default function FilesPanel({ submissionId }: Props) {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'submissions', submissionId, 'files'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setFiles(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [submissionId]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        if (file.size > 15 * 1024 * 1024) {
          alert(`"${file.name}" is too large (max 15 MB).`);
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `submissions/${submissionId}/${Date.now()}_${safeName}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, file, { contentType: file.type });
        const url = await getDownloadURL(ref);
        await addFileRecord(submissionId, {
          name: file.name,
          url,
          contentType: file.type,
          size: file.size,
        });
      }
    } catch (e: any) {
      console.error('Upload failed', e);
      alert(`Upload failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Upload dropzone */}
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        className="flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-luxury-gold hover:bg-luxury-gold/5 transition-colors mb-3"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />
        {uploading ? (
          <><Loader2 className="w-4 h-4 animate-spin text-luxury-gold" /><span className="text-xs text-luxury-gold font-semibold">Uploading…</span></>
        ) : (
          <><Upload className="w-4 h-4 text-slate-500" /><span className="text-xs text-slate-600"><span className="font-semibold">Click to upload</span> or drag & drop · max 15 MB</span></>
        )}
      </label>

      {files.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-4">No files attached yet. Upload site photos, permits, or signed contracts here.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map(file => (
            <li key={file.id} className="group flex items-center gap-2.5 p-2 border border-slate-200 rounded-lg hover:border-slate-300 bg-white">
              {fileIcon(file.contentType)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-luxury-black truncate">{file.name}</p>
                <p className="text-[11px] text-gray-500">
                  {formatBytes(file.size)} · {file.uploadedBy}
                </p>
              </div>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                download={file.name}
                className="p-1.5 text-gray-500 hover:text-luxury-gold hover:bg-slate-100 rounded"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => { if (confirm(`Delete "${file.name}"?`)) deleteFileRecord(submissionId, file.id, file.name); }}
                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
