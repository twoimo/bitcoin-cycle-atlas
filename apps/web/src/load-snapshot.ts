import {atlasSitePath,isAtlasStatic} from '../../../dist/site-paths.js';
import { validateSnapshot } from '@atlas/domain/market-lab';
import type { MarketSnapshot } from '@atlas/contracts/market-lab';

export type Delivery = { kind: 'api' | 'saved'; revision?: string; reason?: string };
export async function loadSnapshot({ fetchImpl = fetch, signal, onDelivery = (_state: Delivery) => {}, timeoutMs = 6000 }: {
  fetchImpl?: typeof fetch; signal?: AbortSignal; onDelivery?: (state: Delivery) => void; timeoutMs?: number;
} = {}): Promise<MarketSnapshot> {
  const bounded = () => signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  async function get(url: string) {
    const response = await fetchImpl(atlasSitePath(url), { credentials: 'same-origin', cache: 'no-store', signal: bounded() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) throw new Error('Snapshot exceeds 8 MiB');
    return JSON.parse(text);
  }
  async function saved(reason:string){
    const snapshot=validateSnapshot(await get('/data/market-lab.json')) as MarketSnapshot;signal?.throwIfAborted();
    const revision=isAtlasStatic()?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)))),b=>b.toString(16).padStart(2,'0')).join(''):undefined;
    onDelivery({kind:'saved',reason,revision});return snapshot;
  }
  if(isAtlasStatic())return saved('static-hosting');
  try {
    const envelope = await get('/api/v1/market-lab');
    if (envelope?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(envelope.revision) || !Number.isFinite(Date.parse(envelope.evaluatedAt))) throw new Error('Invalid API envelope');
    const snapshot = validateSnapshot(envelope.snapshot) as MarketSnapshot;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
    const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== envelope.revision) throw new Error('API snapshot digest mismatch');
    signal?.throwIfAborted();
    onDelivery({ kind: 'api', revision: envelope.revision });
    return snapshot;
  } catch (error) {
    signal?.throwIfAborted();
    return saved(error instanceof Error ? error.message : 'API unavailable');
  }
}
