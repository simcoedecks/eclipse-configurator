import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase';

/**
 * Provider-independent backup export. Pulls every Firestore document the
 * signed-in admin can read and bundles it into a single JSON object.
 *
 * Output shape:
 *   {
 *     exportedAt: ISO string,
 *     project: project id,
 *     version: 1,
 *     collections: {
 *       submissions:   [...with nested activities/notes/tasks/files/viewSessions],
 *       jobs:          [...],
 *       bids:          [...],
 *       contractors:   [...],
 *       dealerProfiles: [...],
 *       counters:      [...]
 *     }
 *   }
 *
 * The output is a plain JSON tree — no Firestore-specific types. Timestamps
 * are converted to ISO strings, document refs to their paths. You can re-import
 * this anywhere (another Firestore project, a SQL database, etc.) by walking
 * the tree.
 */

// Recursively normalize Firestore Timestamps + DocumentReferences into JSON-
// safe values so the export round-trips cleanly.
function normalize(value: any): any {
  if (value === null || value === undefined) return value;
  // Firestore Timestamp objects expose toDate()
  if (typeof value === 'object' && typeof value.toDate === 'function' && typeof value.toMillis === 'function') {
    return { __timestamp: value.toDate().toISOString() };
  }
  // GeoPoint
  if (typeof value === 'object' && typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length === 2) {
    return { __geopoint: { lat: value.latitude, lng: value.longitude } };
  }
  // DocumentReference
  if (typeof value === 'object' && typeof value.path === 'string' && typeof value.id === 'string' && typeof value.parent === 'object') {
    return { __ref: value.path };
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = normalize(value[k]);
    return out;
  }
  return value;
}

async function dumpCollection(name: string): Promise<any[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }));
}

async function dumpSubmissionsWithSubcollections(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'submissions'));
  const out: any[] = [];
  for (const d of snap.docs) {
    const base: any = { id: d.id, ...normalize(d.data()) };
    // Subcollections — parallel fetch for speed
    const [activities, notes, tasks, files, viewSessions] = await Promise.all([
      getDocs(collection(db, 'submissions', d.id, 'activities')).catch(() => null),
      getDocs(collection(db, 'submissions', d.id, 'notes')).catch(() => null),
      getDocs(collection(db, 'submissions', d.id, 'tasks')).catch(() => null),
      getDocs(collection(db, 'submissions', d.id, 'files')).catch(() => null),
      getDocs(collection(db, 'submissions', d.id, 'viewSessions')).catch(() => null),
    ]);
    if (activities)   base.__activities   = activities.docs.map(x => ({ id: x.id, ...normalize(x.data()) }));
    if (notes)        base.__notes        = notes.docs.map(x => ({ id: x.id, ...normalize(x.data()) }));
    if (tasks)        base.__tasks        = tasks.docs.map(x => ({ id: x.id, ...normalize(x.data()) }));
    if (files)        base.__files        = files.docs.map(x => ({ id: x.id, ...normalize(x.data()) }));
    if (viewSessions) base.__viewSessions = viewSessions.docs.map(x => ({ id: x.id, ...normalize(x.data()) }));
    out.push(base);
  }
  return out;
}

export interface BackupProgress {
  step: string;
  current?: number;
  total?: number;
}

export async function exportFullBackup(
  onProgress?: (p: BackupProgress) => void
): Promise<{ json: string; filename: string; sizeBytes: number; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};

  onProgress?.({ step: 'Fetching submissions + subcollections…' });
  const submissions = await dumpSubmissionsWithSubcollections();
  counts.submissions = submissions.length;

  onProgress?.({ step: 'Fetching jobs…' });
  let jobs: any[] = [];
  try { jobs = await dumpCollection('jobs'); counts.jobs = jobs.length; } catch { counts.jobs = 0; }

  onProgress?.({ step: 'Fetching bids…' });
  let bids: any[] = [];
  try { bids = await dumpCollection('bids'); counts.bids = bids.length; } catch { counts.bids = 0; }

  onProgress?.({ step: 'Fetching contractors…' });
  let contractors: any[] = [];
  try { contractors = await dumpCollection('contractors'); counts.contractors = contractors.length; } catch { counts.contractors = 0; }

  onProgress?.({ step: 'Fetching dealer profiles…' });
  let dealerProfiles: any[] = [];
  try { dealerProfiles = await dumpCollection('dealerProfiles'); counts.dealerProfiles = dealerProfiles.length; } catch { counts.dealerProfiles = 0; }

  onProgress?.({ step: 'Fetching counters…' });
  let counters: any[] = [];
  try {
    // Counters sometimes only have known doc IDs (e.g. 'submissions')
    const countersSnap = await getDoc(doc(db, 'counters', 'submissions'));
    if (countersSnap.exists()) counters.push({ id: countersSnap.id, ...normalize(countersSnap.data()) });
    counts.counters = counters.length;
  } catch { counts.counters = 0; }

  const payload = {
    exportedAt: new Date().toISOString(),
    project: 'gen-lang-client-0219790250',
    version: 1,
    notes: 'Eclipse Pergola CRM full export. Timestamps tagged as { __timestamp: ISO }; refs as { __ref: path }; geopoints as { __geopoint: {lat, lng} }.',
    counts,
    collections: {
      submissions,
      jobs,
      bids,
      contractors,
      dealerProfiles,
      counters,
    },
  };

  onProgress?.({ step: 'Serializing…' });
  const json = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    json,
    filename: `eclipse-crm-backup-${stamp}.json`,
    sizeBytes: new Blob([json]).size,
    counts,
  };
}

/** Convenience helper — runs the export then triggers a browser download. */
export async function downloadFullBackup(onProgress?: (p: BackupProgress) => void) {
  const { json, filename, sizeBytes, counts } = await exportFullBackup(onProgress);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, sizeBytes, counts };
}
