export const SAVE_VERSION = 3;
export const LIMITS = Object.freeze({ energy: 12, food: 32, health: 100, sols: 14, target: 60 });

export function createState(toolIds, seed = 20261113) {
  return {
    version: SAVE_VERSION, sol: 1, phase: 'morning', energy: 10, food: 20, health: 100,
    localData: 0, sentData: 0, pendingData: 0, growth: 0, powerFailures: 0,
    lifeSupportPaid: false, generation: 0, dusty: false, shielded: false,
    tools: Object.fromEntries(toolIds.map(id => [id, 'ready'])),
    rng: seed >>> 0, currentEventId: null, choiceId: null, workId: null,
    history: {}, queue: [], log: [], outcome: null,
    weather: 'clear', lightsOn: true, plantStage: 'seed',
    daySummary: [], previousDaySummary: [], summarySol: 0,
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
  const ranges = { sol: [1,14], energy: [0,LIMITS.energy], food: [0,32], health: [0,100], localData: [0,10000], sentData: [0,10000], pendingData: [0,30], growth: [0,2], powerFailures: [0,14], generation: [0,6], rng: [0,4294967295] };
  if (!Object.entries(ranges).every(([key,[min,max]]) => Number.isInteger(s[key]) && s[key] >= min && s[key] <= max)) return false;
  if (!['event','work','end','finished'].includes(s.phase) || !eventIds.includes(s.currentEventId)) return false;
  if (!['lifeSupportPaid','dusty','shielded'].every(key => typeof s[key] === 'boolean')) return false;
  if (![null,'success','incomplete','unsafe'].includes(s.outcome) || (s.phase === 'finished') !== (s.outcome !== null)) return false;
  if (!s.tools || Object.keys(s.tools).length !== 2 || !Object.entries(s.tools).every(([id,status]) => toolIds.includes(id) && ['ready','damaged','consumed'].includes(status))) return false;
  if (!s.history || typeof s.history !== 'object' || Array.isArray(s.history) || !Object.entries(s.history).every(([id,sol]) => eventIds.includes(id) && Number.isInteger(sol) && sol >= 1 && sol <= s.sol)) return false;
  if (!Array.isArray(s.queue) || s.queue.length !== 0) return false; // 后续事件队列为后续内容扩展保留。
  if (!Array.isArray(s.log) || s.log.length > 500 || !s.log.every(item => item && Number.isInteger(item.sol) && item.sol >= 1 && item.sol <= s.sol && typeof item.text === 'string')) return false;
  return [s.choiceId,s.workId].every(value => value === null || typeof value === 'string');
}
