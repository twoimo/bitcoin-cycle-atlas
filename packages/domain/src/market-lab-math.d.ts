import type { Axis, MarketSnapshot, Point, Region, Source } from '@atlas/contracts/market-lab';

export const AXES: readonly Axis[];
export const AXIS_LABELS: Record<Axis, string>;
export const RSI_REFERENCES: readonly { label: string; threshold: number }[];
export const CLOCK_SKEW_MS: number;
export function safeSourceUrl(value: unknown): string | null;
export function validateSnapshot(doc: unknown): MarketSnapshot;
export function validateSeries(rows: Point[], options?: { positive?: boolean }): Point[];
export function calendarDate(now: Date | number, timeZone?: string): string | null;
export function isFutureStamp(value: unknown, now: Date | number, skewMs?: number, timeZone?: string): boolean;
export function observationGate(options?: { generatedAt?: string; source?: Source; prices?: readonly Point[]; now?: Date; timeZone?: string }): { ok: boolean; reason?: string };
export const EXCHANGE_TIMEZONES: Record<string, string>;
export function exchangeTimezoneFor(id: string): string | null;
export function withExchangeTimezones(doc: MarketSnapshot): MarketSnapshot;
export function evidenceHolds(options?: { kiwoomExport?: unknown; gdpVintage?: unknown }): { kiwoomEquivalent: false; realtimeBacktest: false; holds: { id: string; status: string; reason: string }[] };
export function matchingIndex<T>(rows: readonly T[], date: string | null | undefined, readDate?: (row: T) => string): number | null;
export function median(values: number[]): number | null;
export interface Calibration {
  status: 'ready' | 'insufficient' | 'degenerate'; z: number | null; samples: number;
  rawZ?: number; center?: number; scale?: number; clipped?: boolean;
}
export function robustLatest(rows: Point[], options?: { direction?: number; window?: number; minSamples?: number }): Calibration;
export interface Diagnosis {
  region: Region; label: string; status: 'ready' | 'withheld'; score: number | null; scoreLabel: string;
  axes: { key: Axis; label: string; metric: string; latest: number | null; date: string | null; z: number | null; contribution: number | null; status: string; source: Source; reason: string; calibration: Calibration; window: number; direction: number }[];
  coverage: number; total: number; clipSignReversed: boolean; rawMean: number | null; notes: string[];
}
export function diagnoseRegion(doc: MarketSnapshot, region: Region, options?: { now?: Date }): Diagnosis;
export interface ScenarioInput { alpha?: number; beta?: number; gamma?: number; weights?: number[]; sensitivity?: number }
export interface ScenarioResult { pressure: number; contributions: number[]; factors: number[]; index: number; weights: number[]; sensitivity: number; kind: string }
export function positiveFactorScenario(input?: ScenarioInput): ScenarioResult;
export interface RsiRow { date: string; close: number; rsi: number | null; signal: number | null }
export function calculateRsiSeries(prices: Point[], period?: number, signalPeriod?: number): RsiRow[];
export function resolveRsiSelection(prices: Point[], rows: RsiRow[], priceIndex: number): { date: string | null; rsiIndex: number; rsiOscIndex: number | null; unmatched: boolean };
export function thresholdPositions(rsi: number | null): { label: string; threshold: number; difference: number; position: 'below' | 'equal' | 'above' }[];
export interface EconomicsInput { costBasis: number; residual?: number; lifeYears: number; annualRevenue: number; annualOpex: number; discountRate?: number }
export interface EconomicsResult { depreciation: number; operatingProfit: number; operatingCash: number; npv: number; paybackYears: number | null; operatingPaybackYears: number | null; recoveredWithinLife: boolean; nominalTerminalRecovery: boolean; summary: string }
export function assetEconomics(input: EconomicsInput): EconomicsResult;
export function realizedVolatility(prices: Point[], window?: number, annualization?: number): Point[];
