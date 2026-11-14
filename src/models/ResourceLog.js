// Record actual, capped changes; narrative selection never consumes the event RNG.
const fields = ['energy','food','health','localData','pendingData','sentData','growth','powerFailures','generation'];
export function resourceSnapshot(state) {
  return Object.fromEntries([...fields.map(key => [key,state[key] ?? 0]),
    ...Object.entries(state.dailySystems ?? {}).filter(([,value]) => typeof value === 'number').map(([key,value]) => [`systems.${key}`,value])]);
}
export function recordResourceChange(state,before,source,config = {},fallback = '') {
  const after = resourceSnapshot(state);
  const changes = Object.fromEntries(Object.entries(after).map(([key,value]) => [key,value-(before[key] ?? value)]).filter(([,value]) => value !== 0));
  if (!Object.keys(changes).length) return;
  const entries = state.resourceLog ??= [];
  let hash = (state.rng ^ state.sol ^ entries.length) >>> 0;
  for (const char of source) hash = (Math.imul(hash,31) + char.charCodeAt(0)) >>> 0;
  const variants = config.sources?.[source]?.descriptions?.en?.length ?? 1;
  entries.push({source,variant:hash % variants,fallback,changes});
}
