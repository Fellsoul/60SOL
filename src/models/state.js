export const SAVE_VERSION = 3;
export const LIMITS = Object.freeze({ energy: 12, food: 32, health: 100, sols: 14, target: 60 });

export function createState(toolIds, seed = 20261113) {
  return {
    version: SAVE_VERSION, sol: 1, phase: 'morning', energy: 10, food: 20, health: 100,
    localData: 0, sentData: 0, pendingData: 0, growth: 0, powerFailures: 0,
    lifeSupportPaid: false, generation: 0, dusty: false, shielded: false,
    tools: Object.fromEntries(toolIds.map(id => [id, 'ready'])),
    rng: seed >>> 0, currentEventId: null, choiceId: null, workId: null,
    eventDone: false,
    dailySystems: {spares:2,generationCap:6,trackingCap:6,supportExtra:0,careCost:3,harvestFood:8,labUntil:0,greenhouseDisabled:false,antennaLimit:30},
    history: {}, queue: [], log: [], outcome: null,
    weather: 'clear', lightsOn: true, plantStage: 'seed',
    daySummary: [], previousDaySummary: [], summarySol: 0,
    resourceLog: [], previousResourceLog: [],
  };
}

export function logEntry(state, text) {
  state.log.push({ sol: state.sol, text });
}

// 存档属于外部输入；版本和关键字段必须通过校验，不能直接合并进初始状态。
export function validateState(s, eventIds, toolIds) {
  if (!s || s.version !== SAVE_VERSION) return false;
  if (!['clear','sandstorm'].includes(s.weather) || typeof s.lightsOn !== 'boolean' || !['seed','sprout','growing','mature'].includes(s.plantStage)) return false;
  if (!Number.isInteger(s.summarySol) || s.summarySol < 0 || s.summarySol > s.sol) return false;
  if (![s.daySummary,s.previousDaySummary].every(lines => Array.isArray(lines) && lines.length <= 30 && lines.every(line => typeof line === 'string' && line.length <= 2000))) return false;
  for (const entries of [s.resourceLog,s.previousResourceLog]) {
    if (entries === undefined) continue; // Older v3 saves have narrative summaries only.
    if (!Array.isArray(entries) || entries.length > 50 || !entries.every(entry => entry &&
      typeof entry.source === 'string' && entry.source.length <= 200 &&
      Number.isInteger(entry.variant) && entry.variant >= 0 && entry.variant < 100 &&
      typeof entry.fallback === 'string' && entry.fallback.length <= 2000 &&
      entry.changes && typeof entry.changes === 'object' && !Array.isArray(entry.changes) &&
      Object.keys(entry.changes).length <= 20 && Object.entries(entry.changes).every(([key,value]) =>
        /^[a-zA-Z]+(?:\.[a-zA-Z]+)?$/.test(key) && Number.isInteger(value) && Math.abs(value) <= 10000))) return false;
  }
  const ranges = { sol: [1,14], energy: [0,LIMITS.energy], food: [0,32], health: [0,100], localData: [0,10000], sentData: [0,10000], pendingData: [0,30], growth: [0,2], powerFailures: [0,14], generation: [0,6], rng: [0,4294967295] };
  if (!Object.entries(ranges).every(([key,[min,max]]) => Number.isInteger(s[key]) && s[key] >= min && s[key] <= max)) return false;
  if (s.eventDone !== undefined && (typeof s.eventDone !== 'boolean' || (s.eventDone !== (s.choiceId !== null)))) return false;
  if (s.dailySystems !== undefined) {
    const d=s.dailySystems;
    if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.greenhouseDisabled !== 'boolean') return false;
    const limits={spares:[0,20],generationCap:[0,6],trackingCap:[0,6],supportExtra:[0,2],careCost:[3,4],harvestFood:[0,8],labUntil:[0,16],antennaLimit:[0,30]};
    if (!Object.entries(limits).every(([key,[min,max]]) => Number.isInteger(d[key]) && d[key]>=min && d[key]<=max)) return false;
    if (Object.keys(d).length !== 9) return false;
  }
  if (!['event','work','end','finished'].includes(s.phase) || !eventIds.includes(s.currentEventId)) return false;
  if (!['lifeSupportPaid','dusty','shielded'].every(key => typeof s[key] === 'boolean')) return false;
  if (![null,'success','incomplete','unsafe'].includes(s.outcome) || (s.phase === 'finished') !== (s.outcome !== null)) return false;
  if (!s.tools || Object.keys(s.tools).length !== 2 || !Object.entries(s.tools).every(([id,status]) => toolIds.includes(id) && ['ready','damaged','consumed'].includes(status))) return false;
  if (!s.history || typeof s.history !== 'object' || Array.isArray(s.history) || !Object.entries(s.history).every(([id,sol]) => eventIds.includes(id) && Number.isInteger(sol) && sol >= 1 && sol <= s.sol)) return false;
  if (!Array.isArray(s.queue) || s.queue.length !== 0) return false; // 后续事件队列为后续内容扩展保留。
  if (!Array.isArray(s.log) || s.log.length > 500 || !s.log.every(item => item && Number.isInteger(item.sol) && item.sol >= 1 && item.sol <= s.sol && typeof item.text === 'string')) return false;
  return [s.choiceId,s.workId].every(value => value === null || typeof value === 'string');
}
