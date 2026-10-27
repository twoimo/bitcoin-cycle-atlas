export function parseEthereumProspectiveArguments(flags=[]){
  const allowed=['--verify-preserved-only','--include-warm-start'];
  if(!Array.isArray(flags)||flags.length>allowed.length||new Set(flags).size!==flags.length||flags.some(flag=>!allowed.includes(flag)))
    throw new Error('Unsupported or duplicate prospective issuer argument');
  const verifyOnly=flags.includes('--verify-preserved-only'),includeWarmStart=flags.includes('--include-warm-start');
  return {verifyOnly,includeWarmStart,modelKeys:includeWarmStart?['adaptive','pooled','warmStart']:['adaptive','pooled']};
}
