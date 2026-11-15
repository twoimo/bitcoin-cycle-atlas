import { CANONICAL_NODE, onCanonicalRuntime } from '../../scripts/canonical-runtime.mjs';

if (!onCanonicalRuntime()) {
  throw new Error(`This file replays outputs produced on linux/x64 Node ${CANONICAL_NODE}, so on ${process.platform}/${process.arch} ${process.version} its result is not evidence either way. Run npm test, which replays it in the pinned Docker image from scripts/canonical-runtime.mjs.`);
}
