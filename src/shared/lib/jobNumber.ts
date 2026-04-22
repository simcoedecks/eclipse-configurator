import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

/** Atomically increments and returns the next sequential job number.
 *  Counter doc lives at counters/submissions with shape:
 *    { count: number }
 *
 *  Starts at 1000 for aesthetics — first-ever lead becomes Job #1001. */
export async function nextJobNumber(): Promise<number> {
  const counterRef = doc(db, 'counters', 'submissions');
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = (snap.exists() ? (snap.data()?.count as number | undefined) : undefined) ?? 1000;
    const next = current + 1;
    tx.set(counterRef, { count: next }, { merge: true });
    return next;
  });
}

/** Format a job number for display: "#1047" */
export function formatJobNumber(n: number | undefined | null): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return `#${n}`;
}
