export type UsSeries = 'GDPC1' | 'TB3MS' | 'VIXCLS';
export interface CollectionSource {
  series: UsSeries;
  axis: 'alpha' | 'beta' | 'gamma';
  url: string;
  status: 'ready' | 'error';
  checkedAt: string;
  sha256?: string;
  lastObservation?: string;
  rows?: number;
  error?: string;
}
export interface CollectionRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'published' | 'unchanged' | 'failed' | 'interrupted';
  revision: string | null;
  sources: CollectionSource[];
  error: string | null;
}
export interface CollectionSchedule {
  enabled: boolean;
  intervalMs: number;
  running: boolean;
  nextDueAt: string | null;
}
export interface UsCollectionStatus {
  schemaVersion: 1;
  evaluatedAt: string;
  schedule: CollectionSchedule;
  latest: CollectionRun | null;
  lastSuccess: CollectionRun | null;
}
