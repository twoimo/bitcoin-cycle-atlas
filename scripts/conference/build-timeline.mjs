#!/usr/bin/env node
import { buildTimelineFromConfig, writeTimelineBundle } from './timeline.mjs';

const args = process.argv.slice(2);
const help = 'Usage: node scripts/conference/build-timeline.mjs --config <file.json> [--publish-ready]\nDefault: draft with explicit missing-review blockers. --publish-ready validates input/review receipts only; it does not perform listening, browser or deployment checks. Existing output directories are never replaced.';
try {
  if (args.length === 1 && args[0] === '--help') console.log(help);
  else {
    if (args[0] !== '--config' || !args[1] || (args.length !== 2 && !(args.length === 3 && args[2] === '--publish-ready'))) throw new Error(help);
    const result = await buildTimelineFromConfig(args[1], { publishReady: args[2] === '--publish-ready' });
    console.log(JSON.stringify(await writeTimelineBundle(result), null, 2));
    if (result.timeline.verification.blockers.length) console.log(JSON.stringify({ status: 'draft', blockers: result.timeline.verification.blockers }, null, 2));
  }
} catch (error) {
  console.error(`Conference timeline build failed: ${error.message}`);
  process.exitCode = 1;
}
