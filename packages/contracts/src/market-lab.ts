export type Region = 'us' | 'kr';
export type Axis = 'alpha' | 'beta' | 'gamma';
export type Point = [string, number];
export interface Source {
  id: string;
  label: string;
  url: string;
  unit: string;
  frequency: string;
  retrievedAt: string;
  lastObservation: string | null;
  releaseTimeKnown: boolean;
  status: 'ready' | 'error';
  error?: string;
  linkLabel?: string;
  displayDecimals?: number;
  timezone?: string;
  [key: string]: unknown;
}
export interface AxisSeries {
  sourceId: string;
  metric: string;
  direction: 1 | -1;
  window: number;
  minSamples: number;
  staleAfterDays: number;
  values: Point[];
}
export interface Market {
  id: string;
  sourceId: string;
  symbol: string;
  name: string;
  region: Region;
  unit: string;
  timezone?: string;
  prices: Point[];
  [key: string]: unknown;
}
export interface MarketSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  modelVersion: string;
  sources: Source[];
  regions: Record<Region, { label: string; axes: Record<Axis, AxisSeries> }>;
  markets: Market[];
  [key: string]: unknown;
}
export interface MarketLabEnvelope {
  schemaVersion: 1;
  revision: string;
  importedAt: string;
  publishedAt: string | null;
  evaluatedAt: string;
  snapshot: MarketSnapshot;
  diagnostics: Record<Region, unknown>;
  usDirection?: {
    version: 'proxy-product-1';
    direction: 'UP'|'DOWN'|null;
    product: number|null;
    factors: {key:Axis;z:number|null;date:string|null;status:string}[];
    reason: string;
    kind: 'proxy_model_direction';
  };
}
