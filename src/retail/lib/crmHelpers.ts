/**
 * CRM helper functions (admin-side only).
 * Writes go through the Firebase client SDK, guarded by Firestore rules
 * that require isAdmin() on the subcollections.
 */

import {
  collection, addDoc, doc, setDoc, deleteDoc, serverTimestamp, query, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../../shared/firebase';
import type { Activity, ActivityType } from '../../shared/lib/crm';

export async function logActivity(
  submissionId: string,
  type: ActivityType,
  message: string,
  meta: Record<string, any> = {}
): Promise<void> {
  try {
    const actor = auth.currentUser?.email || 'system';
    await addDoc(collection(db, 'submissions', submissionId, 'activities'), {
      type,
      message,
      actor,
      meta,
      createdAt: serverTimestamp(),
    } as Activity);
  } catch (e) {
    console.warn('Failed to log activity', e);
  }
}

export async function fetchRecentActivities(submissionId: string, take = 50) {
  try {
    const q = query(
      collection(db, 'submissions', submissionId, 'activities'),
      orderBy('createdAt', 'desc'),
      limit(take)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Failed to fetch activities', e);
    return [];
  }
}

// ─── Notes ──────────────────────────────────────────────────────────────────
export async function addNote(submissionId: string, content: string) {
  if (!content.trim()) return;
  const actor = auth.currentUser?.email || 'admin';
  const ref = await addDoc(collection(db, 'submissions', submissionId, 'notes'), {
    content: content.trim(),
    actor,
    createdAt: serverTimestamp(),
  });
  await logActivity(submissionId, 'note_added', `Added an internal note`, { noteId: ref.id });
  return ref.id;
}
export async function deleteNote(submissionId: string, noteId: string) {
  await deleteDoc(doc(db, 'submissions', submissionId, 'notes', noteId));
}

// ─── Tasks ──────────────────────────────────────────────────────────────────
export interface TaskInput {
  title: string;
  dueAt?: Date | null;
  priority?: 'low' | 'normal' | 'high';
}
export async function addTask(submissionId: string, input: TaskInput) {
  if (!input.title.trim()) return;
  const actor = auth.currentUser?.email || 'admin';
  const ref = await addDoc(collection(db, 'submissions', submissionId, 'tasks'), {
    title: input.title.trim(),
    dueAt: input.dueAt || null,
    priority: input.priority || 'normal',
    completedAt: null,
    createdBy: actor,
    createdAt: serverTimestamp(),
  });
  await logActivity(submissionId, 'task_created', `Task: "${input.title.trim()}"`, { taskId: ref.id });
  return ref.id;
}
export async function toggleTask(submissionId: string, taskId: string, complete: boolean, title?: string) {
  await setDoc(
    doc(db, 'submissions', submissionId, 'tasks', taskId),
    { completedAt: complete ? serverTimestamp() : null },
    { merge: true }
  );
  if (complete) {
    await logActivity(submissionId, 'task_completed', `Completed: "${title || 'task'}"`, { taskId });
  }
}
export async function deleteTask(submissionId: string, taskId: string) {
  await deleteDoc(doc(db, 'submissions', submissionId, 'tasks', taskId));
}

// ─── Pipeline stage ────────────────────────────────────────────────────────
export async function changeStage(submissionId: string, newStage: string, previousStage?: string, stageLabel?: string) {
  await setDoc(doc(db, 'submissions', submissionId), { pipelineStage: newStage }, { merge: true });
  await logActivity(
    submissionId,
    'stage_changed',
    previousStage
      ? `Moved from ${previousStage} → ${stageLabel || newStage}`
      : `Set stage to ${stageLabel || newStage}`,
    { from: previousStage, to: newStage }
  );
}

// ─── Assignment ─────────────────────────────────────────────────────────────
export async function assignLead(submissionId: string, assigneeEmail: string | null, assigneeName?: string) {
  await setDoc(doc(db, 'submissions', submissionId), { assignedTo: assigneeEmail }, { merge: true });
  await logActivity(
    submissionId,
    'manual',
    assigneeEmail ? `Assigned to ${assigneeName || assigneeEmail}` : 'Unassigned',
    { assignedTo: assigneeEmail }
  );
}

// ─── Lead source ───────────────────────────────────────────────────────────
export async function updateSource(submissionId: string, source: string, sourceLabel?: string, ref?: string) {
  await setDoc(doc(db, 'submissions', submissionId), {
    source,
    ...(ref !== undefined ? { sourceRef: ref } : {}),
  }, { merge: true });
  await logActivity(
    submissionId,
    'manual',
    `Lead source set to ${sourceLabel || source}${ref ? ` (ref: ${ref})` : ''}`,
    { source, ref }
  );
}

// ─── Tags ──────────────────────────────────────────────────────────────────
export async function addTag(submissionId: string, currentTags: string[], tag: string) {
  const normalized = tag.trim();
  if (!normalized) return;
  if (currentTags.includes(normalized)) return;
  const nextTags = [...currentTags, normalized];
  await setDoc(doc(db, 'submissions', submissionId), { tags: nextTags }, { merge: true });
  await logActivity(submissionId, 'tag_added', `Tagged as "${normalized}"`, { tag: normalized });
}
export async function removeTag(submissionId: string, currentTags: string[], tag: string) {
  const nextTags = currentTags.filter(t => t !== tag);
  await setDoc(doc(db, 'submissions', submissionId), { tags: nextTags }, { merge: true });
  await logActivity(submissionId, 'tag_removed', `Removed tag "${tag}"`, { tag });
}

// ─── Files ─────────────────────────────────────────────────────────────────
export interface FileRecord {
  name: string;
  url: string;
  contentType: string;
  size: number;
  uploadedBy: string;
}
export async function addFileRecord(submissionId: string, record: Omit<FileRecord, 'uploadedBy'>) {
  const actor = auth.currentUser?.email || 'admin';
  const ref = await addDoc(collection(db, 'submissions', submissionId, 'files'), {
    ...record,
    uploadedBy: actor,
    createdAt: serverTimestamp(),
  });
  await logActivity(submissionId, 'file_uploaded', `Uploaded "${record.name}"`, { fileId: ref.id, name: record.name });
  return ref.id;
}
export async function deleteFileRecord(submissionId: string, fileId: string, fileName?: string) {
  await deleteDoc(doc(db, 'submissions', submissionId, 'files', fileId));
  await logActivity(submissionId, 'file_deleted', `Removed "${fileName || 'file'}"`, { fileId });
}
