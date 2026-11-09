#!/usr/bin/env node
import { verifyTimelineBundle } from './timeline.mjs';

const args = process.argv.slice(2);
const help = 'Usage: node scripts/conference/verify-timeline.mjs --config <file.json> [--publish-ready]\nRechecks every original SRT/media hash and exact generated JSON. --publish-ready checks review receipts, not actual listening/browser/production acceptance.';
try {
  if (args.length === 1 && args[0] === '--help') console.log(help);
  else {
    if (args[0] !== '--config' || !args[1] || (args.length !== 2 && !(args.length === 3 && args[2] === '--publish-ready'))) throw new Error(help);
    console.log(JSON.stringify(await verifyTimelineBundle(args[1], { publishReady: args[2] === '--publish-ready' }), null, 2));
  }
} catch (error) {
  console.error(`Conference timeline verification failed: ${error.message}`);
  process.exitCode = 1;
}
