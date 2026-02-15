import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import {
  logReadAuditSessionReport,
  recordReadAuditEvent,
} from '@/src/utils/readAuditCollector';
import {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FirestoreError,
  getDoc,
  getDocs,
  onSnapshot,
  Query,
  QuerySnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getReadBudgetSnapshot, registerSessionReadCount } from './ReadBudgetGuard';

export type FirestoreReadAuditOpType =
  | 'getDoc'
  | 'getDocs'
  | 'onSnapshotInitial'
  | 'onSnapshotIncremental';

export interface FirestoreReadAuditEvent {
  opType: FirestoreReadAuditOpType;
  path: string;
  queryKey: string;
  callsite: string;
  docReadCount: number;
  timestamp: number;
}

export interface FirestoreReadAuditMeta {
  path: string;
  queryKey: string;
  callsite: string;
}

const MAX_AUDIT_EVENTS = 5000;
const auditEvents: FirestoreReadAuditEvent[] = [];

const normalizeReadCount = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const getSnapshotReadCount = (snapshot: unknown, isInitial: boolean): number => {
  if (!snapshot || typeof snapshot !== 'object') {
    return 0;
  }

  const maybeQuerySnapshot = snapshot as QuerySnapshot<DocumentData>;
  if (typeof maybeQuerySnapshot.size === 'number') {
    if (isInitial) {
      return normalizeReadCount(maybeQuerySnapshot.size);
    }

    const changes = maybeQuerySnapshot.docChanges();
    return normalizeReadCount(changes.length);
  }

  const maybeDocSnapshot = snapshot as DocumentSnapshot<DocumentData>;
  if (typeof maybeDocSnapshot.exists === 'function') {
    return maybeDocSnapshot.exists() ? 1 : 0;
  }

  return 0;
};

const addAuditEvent = (event: FirestoreReadAuditEvent): void => {
  if (!READ_OPTIMIZATION_FLAGS.enableReadAuditLogging) {
    return;
  }

  if (auditEvents.length >= MAX_AUDIT_EVENTS) {
    auditEvents.shift();
  }

  auditEvents.push(event);
  recordReadAuditEvent(event);
  registerSessionReadCount(event.docReadCount, event.callsite);
};

const createAuditEvent = (
  opType: FirestoreReadAuditOpType,
  readCount: number,
  meta: FirestoreReadAuditMeta
): FirestoreReadAuditEvent => ({
  opType,
  path: meta.path,
  queryKey: meta.queryKey,
  callsite: meta.callsite,
  docReadCount: normalizeReadCount(readCount),
  timestamp: Date.now(),
});

export async function auditedGetDoc<T = DocumentData>(
  ref: DocumentReference<T>,
  meta: FirestoreReadAuditMeta
): Promise<DocumentSnapshot<T>> {
  const snapshot = (await getDoc(ref)) as DocumentSnapshot<T> | undefined;
  const exists = snapshot && typeof snapshot.exists === 'function' ? snapshot.exists() : false;

  addAuditEvent(createAuditEvent('getDoc', exists ? 1 : 0, meta));

  return snapshot as DocumentSnapshot<T>;
}

export async function auditedGetDocs<T = DocumentData>(
  source: Query<T>,
  meta: FirestoreReadAuditMeta
): Promise<QuerySnapshot<T>> {
  const snapshot = (await getDocs(source)) as QuerySnapshot<T> | undefined;

  addAuditEvent(createAuditEvent('getDocs', snapshot?.size || 0, meta));

  return snapshot as QuerySnapshot<T>;
}

export function auditedOnSnapshot<T = DocumentData>(
  source: Query<T>,
  onNext: (snapshot: QuerySnapshot<T>) => void,
  onError: ((error: FirestoreError) => void) | undefined,
  meta: FirestoreReadAuditMeta
): Unsubscribe;
export function auditedOnSnapshot<T = DocumentData>(
  source: DocumentReference<T>,
  onNext: (snapshot: DocumentSnapshot<T>) => void,
  onError: ((error: FirestoreError) => void) | undefined,
  meta: FirestoreReadAuditMeta
): Unsubscribe;
export function auditedOnSnapshot<T = DocumentData>(
  source: Query<T> | DocumentReference<T>,
  onNext: ((snapshot: QuerySnapshot<T>) => void) | ((snapshot: DocumentSnapshot<T>) => void),
  onError: ((error: FirestoreError) => void) | undefined,
  meta: FirestoreReadAuditMeta
): Unsubscribe {
  let isInitial = true;

  return onSnapshot(
    source as Query<T>,
    (snapshot) => {
      const opType: FirestoreReadAuditOpType = isInitial
        ? 'onSnapshotInitial'
        : 'onSnapshotIncremental';

      addAuditEvent(createAuditEvent(opType, getSnapshotReadCount(snapshot, isInitial), meta));

      isInitial = false;
      (onNext as (snapshot: QuerySnapshot<T> | DocumentSnapshot<T>) => void)(
        snapshot as QuerySnapshot<T> | DocumentSnapshot<T>
      );
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    }
  );
}

const aggregateBy = (key: 'path' | 'opType' | 'callsite') => {
  const totals = new Map<string, number>();

  auditEvents.forEach((event) => {
    const aggregateKey = event[key];
    totals.set(aggregateKey, (totals.get(aggregateKey) || 0) + event.docReadCount);
  });

  return Array.from(totals.entries())
    .map(([name, reads]) => ({ name, reads }))
    .sort((a, b) => b.reads - a.reads);
};

export function getFirestoreReadAuditEvents(): FirestoreReadAuditEvent[] {
  return [...auditEvents];
}

export function clearFirestoreReadAuditEvents(): void {
  auditEvents.length = 0;
}

export function getFirestoreReadAuditReport() {
  const totalReads = auditEvents.reduce((sum, event) => sum + event.docReadCount, 0);

  return {
    totalReads,
    eventCount: auditEvents.length,
    byPath: aggregateBy('path'),
    byOperation: aggregateBy('opType'),
    byCallsite: aggregateBy('callsite'),
    budget: getReadBudgetSnapshot(),
  };
}

export function logFirestoreReadAuditReport(context = 'session') {
  if (!READ_OPTIMIZATION_FLAGS.enableReadAuditLogging || !__DEV__) {
    return;
  }

  const report = getFirestoreReadAuditReport();

  console.log(`[FirestoreReadAudit:${context}]`, {
    totalReads: report.totalReads,
    eventCount: report.eventCount,
    topPaths: report.byPath.slice(0, 5),
    topOperations: report.byOperation.slice(0, 5),
    topCallsites: report.byCallsite.slice(0, 5),
    budget: report.budget,
  });

  logReadAuditSessionReport(context);
}
