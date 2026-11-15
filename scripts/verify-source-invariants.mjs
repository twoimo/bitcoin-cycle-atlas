import { fileURLToPath } from 'node:url';
import { assertEthReviewInventory } from './eth-review-inventory.mjs';
import { assertRecordedSources } from './recorded-source-pins.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
await assertEthReviewInventory(root);
await assertRecordedSources(root);
console.log(JSON.stringify({ status: 'ok', checks: ['eth-review-inventory', 'recorded-source-pins'] }));
