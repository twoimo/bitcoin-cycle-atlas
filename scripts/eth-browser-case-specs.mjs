import {workspaceBrowserCases} from './verify-workspace-browser.mjs';
import {replayBrowserCases} from './verify-forecast-replay-browser.mjs';
import {chartReplayBrowserCases} from './verify-chart-replay-browser.mjs';
import {consolidatedWorkspaceCases} from './verify-consolidated-workspace-browser.mjs';

// The browser runner and evidence handoff share the complete ordered inventory.
// Importing this module does not start Chrome or read generated browser evidence.
export function createEthBrowserCaseSpecs(){
  const widths=[320,390,768,1024,1440];
  const caseSpecs=widths.flatMap(width=>(width===320?['data','eth','bmnr','mstr','zero-fixture']:['data','eth','bmnr','mstr']).map(page=>({page,width,height:900,touch:width<=390})));
  caseSpecs.push(
    // Twenty 40px rows plus the 54px header exceed the 817px scrollport at this height.
    // Retain this viewport as a vertical-scroll case and cover fill/resize above that threshold.
    {page:'data',width:1620,height:1008,touch:false,responsive:true,fill:false,horizontalScroll:false},
    {page:'data',width:1620,height:1100,touch:false,responsive:true,fill:true,resize:true},
    {page:'data',width:1920,height:1440,touch:false,responsive:true,fill:true},
    {page:'data',width:900,height:430,touch:true,responsive:true,fill:false},
    {page:'data',width:320,height:568,touch:true,responsive:true,fill:false});
  caseSpecs.push(...workspaceBrowserCases,...replayBrowserCases,...chartReplayBrowserCases,...consolidatedWorkspaceCases);
  return caseSpecs.map(spec=>({...spec}));
}
