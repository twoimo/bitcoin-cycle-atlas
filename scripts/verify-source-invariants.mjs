import { fileURLToPath } from 'node:url';
import { assertEthReviewInventory } from './eth-review-inventory.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
await assertEthReviewInventory(root);
console.log(JSON.stringify({ status: 'ok', checks: ['eth-review-inventory'] }));
