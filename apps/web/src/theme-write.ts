import {axes,type ThemeDraft} from '@atlas/domain/themes';
export type PendingThemeWrite={requestId:string;revision:string;draft:ThemeDraft};
const key='atlas.themes.pending.v1';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readThemePending(storage:Store):PendingThemeWrite|null{
  try{const value=JSON.parse(storage.getItem(key)??'null');if(!value||value.version!==1||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.pending?.requestId)||!/^[a-f0-9]{64}$/.test(value.pending?.revision)||typeof value.pending?.draft?.title!=='string'||value.pending.draft.title.length>100)return null;
    for(const a of axes){const c=value.pending.draft.criteria?.[a];if(!c||!['pass','fail','hold'].includes(c.state)||typeof c.reason!=='string'||c.reason.length>400||!Array.isArray(c.evidenceIds)||c.evidenceIds.length>12||c.evidenceIds.some((id:unknown)=>typeof id!=='string'))return null;}return value.pending;
  }catch{return null;}
}
export function persistThemePending(storage:Store,pending:PendingThemeWrite){storage.setItem(key,JSON.stringify({version:1,pending}));const read=readThemePending(storage);if(!read||JSON.stringify(read)!==JSON.stringify(pending))throw new Error('Pending write persistence failed');}
export function clearThemePending(storage:Store){try{storage.removeItem(key);}catch{/* A leftover request ID is reconciled, never replayed as a new write. */}}
