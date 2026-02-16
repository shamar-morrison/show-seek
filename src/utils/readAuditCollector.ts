import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';

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

type AggregateMap = Map<string, number>;

interface ReadAuditSessionState {
  sessionId: string;
  userId?: string;
  startedAt: number;
  lastEventAt: number | null;
  totalReads: number;
  eventCount: number;
  byPath: AggregateMap;
  byOperation: AggregateMap;
  byCallsite: AggregateMap;
}

const GREEN_MAX_READS_PER_DAY = 80;
const YELLOW_MAX_READS_PER_DAY = 120;
const MAX_SESSION_ID_SEED = 999999;

let activeSession: ReadAuditSessionState | null = null;
let sessionSeed = 0;

const createSessionId = () => {
  sessionSeed = (sessionSeed + 1) % MAX_SESSION_ID_SEED;
  return `read-audit-${Date.now()}-${sessionSeed}`;
};

const sanitizeReadCount = (docReadCount: number) => {
  if (!Number.isFinite(docReadCount)) return 0;
  return Math.max(0, Math.floor(docReadCount));
};

const ensureSession = () => {
  if (!activeSession) {
    startReadAuditSession();
  }

  return activeSession as ReadAuditSessionState;
};

const sortAggregate = (aggregate: AggregateMap) =>
  Array.from(aggregate.entries())
    .map(([name, reads]) => ({ name, reads }))
    .sort((a, b) => b.reads - a.reads);

const getDurationMs = (session: ReadAuditSessionState) => {
  const endTs = session.lastEventAt ?? Date.now();
  return Math.max(1, endTs - session.startedAt);
};

const classifyReadBand = (readsPerDayEstimate: number) => {
  if (readsPerDayEstimate <= GREEN_MAX_READS_PER_DAY) {
    return 'green';
  }

  if (readsPerDayEstimate <= YELLOW_MAX_READS_PER_DAY) {
    return 'yellow';
  }

  return 'red';
};

export function startReadAuditSession(userId?: string) {
  activeSession = {
    sessionId: createSessionId(),
    userId,
    startedAt: Date.now(),
    lastEventAt: null,
    totalReads: 0,
    eventCount: 0,
    byPath: new Map<string, number>(),
    byOperation: new Map<string, number>(),
    byCallsite: new Map<string, number>(),
  };

  return {
    sessionId: activeSession.sessionId,
    userId: activeSession.userId,
    startedAt: activeSession.startedAt,
  };
}

export function clearReadAuditSession() {
  activeSession = null;
}

export function recordReadAuditEvent(event: FirestoreReadAuditEvent) {
  if (!READ_OPTIMIZATION_FLAGS.enableReadAuditLogging) {
    return;
  }

  const session = ensureSession();
  const reads = sanitizeReadCount(event.docReadCount);

  session.lastEventAt = event.timestamp || Date.now();
  session.totalReads += reads;
  session.eventCount += 1;

  session.byPath.set(event.path, (session.byPath.get(event.path) || 0) + reads);
  session.byOperation.set(event.opType, (session.byOperation.get(event.opType) || 0) + reads);
  session.byCallsite.set(event.callsite, (session.byCallsite.get(event.callsite) || 0) + reads);
}

export function getReadAuditSessionReport() {
  if (!activeSession) {
    return null;
  }

  const durationMs = getDurationMs(activeSession);
  const durationHours = durationMs / (1000 * 60 * 60);
  const readsPerDayEstimate = Math.round((activeSession.totalReads / durationMs) * 86400000);

  return {
    sessionId: activeSession.sessionId,
    userId: activeSession.userId,
    startedAt: activeSession.startedAt,
    lastEventAt: activeSession.lastEventAt,
    durationMs,
    durationHours,
    totalReads: activeSession.totalReads,
    eventCount: activeSession.eventCount,
    readsPerDayEstimate,
    thresholdBand: classifyReadBand(readsPerDayEstimate),
    byPath: sortAggregate(activeSession.byPath),
    byOperation: sortAggregate(activeSession.byOperation),
    byCallsite: sortAggregate(activeSession.byCallsite),
  };
}

export function logReadAuditSessionReport(context = 'session') {
  if (!__DEV__ || !READ_OPTIMIZATION_FLAGS.enableReadAuditLogging) {
    return;
  }

  const report = getReadAuditSessionReport();

  if (!report) {
    // console.log(`[ReadAuditCollector:${context}]`, { message: 'No active session' });
    return;
  }

  // console.log(`[ReadAuditCollector:${context}]`, {
  //   sessionId: report.sessionId,
  //   userId: report.userId ?? null,
  //   durationHours: Number(report.durationHours.toFixed(2)),
  //   totalReads: report.totalReads,
  //   eventCount: report.eventCount,
  //   readsPerDayEstimate: report.readsPerDayEstimate,
  //   thresholdBand: report.thresholdBand,
  //   topPaths: report.byPath.slice(0, 5),
  //   topOperations: report.byOperation.slice(0, 5),
  //   topCallsites: report.byCallsite.slice(0, 5),
  // });
}
