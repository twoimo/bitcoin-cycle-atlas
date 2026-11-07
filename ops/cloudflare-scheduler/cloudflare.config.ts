import { defineConfig,bindings,triggers } from 'cf/config';
import { SCHEDULES } from './worker.js';

export default defineConfig({
  worker:{
    name:'bitcoin-cycle-atlas-scheduler',
    entrypoint:'./worker.js',
    compatibilityDate:'2026-11-07',
    workersDev:false,
    previewUrls:false,
    env:{MARKET_REFRESH_DEPLOY_HOOK:bindings.secret(),ETH_ARCHIVE_DEPLOY_HOOK:bindings.secret()},
    triggers:SCHEDULES.map(job=>triggers.scheduled({schedule:job.cron})),
    // Two configured Cron definitions, five invocations/day, one outgoing
    // request/event. No storage, database, queue or paid runtime binding.
    // Free Workers Logs currently includes 200,000 events/day; traces are off
    // so outbound URL credentials cannot become request-span attributes.
    // https://developers.cloudflare.com/workers/observability/logs/workers-logs/
    observability:{enabled:true,headSamplingRate:1,logs:{enabled:true,invocationLogs:true},traces:{enabled:false}},
  },
});
