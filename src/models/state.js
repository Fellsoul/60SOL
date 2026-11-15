import { validSnapshot } from './SpaceData.js';
import { validVisualAction } from './VisualAction.js';
import { CREW_IDS, freshCrew } from './ExpeditionRules.js';
export const SAVE_VERSION = 5;
export const LIMITS = Object.freeze({ energy: 12, food: 128, health: 100, sols: 14, target: 60 });

export function createState(toolIds, seed = 20261113) {
  return {
    version: SAVE_VERSION, difficulty:'medium', sol: 1, phase: 'morning', energy: 10, food: 80, health: 100,
    localData: 0, sentData: 0, pendingData: 0, growth: 0, powerFailures: 0,
    lifeSupportPaid: false, generation: 0, dusty: false, shielded: false,
    tools: Object.fromEntries(toolIds.map(id => [id, 'ready'])),
    rng: seed >>> 0, currentEventId: null, choiceId: null, workId: null,
    eventDone: false,
    visualAction: null,
    samples: [], crew:freshCrew(), expeditionPlan:null, robotSampleSol:null,
    missionSnapshot: null,
    spaceTrace: [],
    dailySystems: {spares:2,generationCap:6,trackingCap:6,supportExtra:0,careCost:3,harvestFood:32,labUntil:0,greenhouseDisabled:false,antennaLimit:30},
    history: {}, queue: [], log: [], outcome: null,
    weather: 'clear', lightsOn: true, plantStage: 'seed',
    daySummary: [], previousDaySummary: [], summarySol: 0,
    resourceLog: [], previousResourceLog: [],
    missionJournal: [],
    guide: {terminalSol:0,notebookSol:0},
  };
}

export function logEntry(state, text) {
  state.log.push({ sol: state.sol, text });
}

// 存档属于外部输入；版本和关键字段必须通过校验，不能直接合并进初始状态。
export function validateState(s, eventIds, toolIds) {
  if (!s || s.version !== SAVE_VERSION) return false;
  if (s.guide !== undefined && (!s.guide || !['terminalSol','notebookSol'].every(key => Number.isInteger(s.guide[key]) && s.guide[key]>=0 && s.guide[key]<=Math.min(s.sol,3)) || s.guide.notebookSol>s.guide.terminalSol)) return false;
  if (s.difficulty !== undefined && !['easy','medium','hard'].includes(s.difficulty)) return false;
  if (s.concurrentEvents !== undefined && (!Array.isArray(s.concurrentEvents) || s.concurrentEvents.length > 6 ||
    new Set(s.concurrentEvents.map(item => item?.id)).size !== s.concurrentEvents.length ||
    !s.concurrentEvents.every(item => item && typeof item.id === 'string' && item.id.length <= 80 &&
      eventIds.includes(item.eventId) && (item.choiceId === null || typeof item.choiceId === 'string') &&
      (item.crewId === undefined || (CREW_IDS.includes(item.crewId) && item.eventId === 'E14'))))) return false;
  if (!Array.isArray(s.samples) || s.samples.length > 3 || !s.samples.every(uses => uses === 1 || uses === 2)) return false;
  if (!s.crew || Object.keys(s.crew).length !== 2 || !CREW_IDS.every(id => {
    const c=s.crew[id];
    if (!c || Object.keys(c).some(key => !['departSol','returnSol','fatigue','comaDays'].includes(key))) return false;
    if (c.comaDays !== undefined && (!Number.isInteger(c.comaDays) || c.comaDays < 0 || c.comaDays > 2)) return false;
    if (![c.departSol,c.returnSol].every(sol => sol === null || (Number.isInteger(sol) && sol >= 1 && sol <= 15))) return false;
    if (!Number.isInteger(c.fatigue) || c.fatigue < 0 || c.fatigue > 4) return false;
    return (c.departSol === null) === (c.returnSol === null) &&
      (c.departSol === null || (c.departSol <= s.sol && Math.min(s.sol,LIMITS.sols) < c.returnSol && [1,2].includes(c.returnSol-c.departSol) && c.fatigue === 0 && !c.comaDays));
  })) return false;
  if (s.robotSampleSol !== null && (!Number.isInteger(s.robotSampleSol) || s.robotSampleSol < 1 || s.robotSampleSol > s.sol)) return false;
  if (s.expeditionPlan !== null && (!s.expeditionPlan || !CREW_IDS.includes(s.expeditionPlan.crewId) ||
    s.expeditionPlan.departSol !== s.sol+1 || s.sol > 12 || s.crew[s.expeditionPlan.crewId].returnSol !== null || s.crew[s.expeditionPlan.crewId].fatigue > 0 || s.crew[s.expeditionPlan.crewId].comaDays > 0)) return false;
  if (!['clear','sandstorm'].includes(s.weather) || typeof s.lightsOn !== 'boolean' || !['seed','sprout','growing','mature'].includes(s.plantStage)) return false;
  if (!Number.isInteger(s.summarySol) || s.summarySol < 0 || s.summarySol > s.sol) return false;
  if (![s.daySummary,s.previousDaySummary].every(lines => Array.isArray(lines) && lines.length <= 30 && lines.every(line => typeof line === 'string' && line.length <= 2000))) return false;
  if (s.missionJournal !== undefined && (!Array.isArray(s.missionJournal) || s.missionJournal.length > LIMITS.sols ||
    !s.missionJournal.every((day,index,days) => day && Number.isInteger(day.sol) && day.sol >= 1 && day.sol <= Math.min(s.sol,LIMITS.sols) &&
      (index === 0 || day.sol > days[index-1].sol) &&
      Array.isArray(day.summary) && day.summary.length <= 30 && day.summary.every(line => typeof line === 'string' && line.length <= 2000) &&
      Array.isArray(day.resources) && Array.isArray(day.events) && day.events.length <= 8 && day.events.every(event => event &&
        eventIds.includes(event.eventId) && typeof event.summaryLine === 'string' && event.summaryLine.length <= 2000 &&
        (event.choiceId === null || (typeof event.choiceId === 'string' && event.choiceId.length <= 100)) &&
        (event.choiceSummary === null || (typeof event.choiceSummary === 'string' && event.choiceSummary.length <= 2000)))))) return false;
  for (const entries of [s.resourceLog,s.previousResourceLog,...(s.missionJournal ?? []).map(day => day.resources)]) {
    if (entries === undefined) continue; // Older v3 saves have narrative summaries only.
    if (!Array.isArray(entries) || entries.length > 50 || !entries.every(entry => entry &&
      typeof entry.source === 'string' && entry.source.length <= 200 &&
      (entry.generated === undefined || (entry.source === 'generation' && Number.isInteger(entry.generated) && entry.generated >= 0 && entry.generated <= 9)) &&
      Number.isInteger(entry.variant) && entry.variant >= 0 && entry.variant < 100 &&
      typeof entry.fallback === 'string' && entry.fallback.length <= 2000 &&
      entry.changes && typeof entry.changes === 'object' && !Array.isArray(entry.changes) &&
      Object.keys(entry.changes).length <= 20 && Object.entries(entry.changes).every(([key,value]) =>
        /^[a-zA-Z]+(?:\.[a-zA-Z]+)?$/.test(key) && Number.isInteger(value) && Math.abs(value) <= 10000))) return false;
  }
  const ranges = { sol: [1,15], energy: [0,LIMITS.energy], food: [0,LIMITS.food], health: [0,100], localData: [0,10000], sentData: [0,10000], pendingData: [0,30], growth: [0,2], powerFailures: [0,14], generation: [0,9], rng: [0,4294967295] };
  if (!Object.entries(ranges).every(([key,[min,max]]) => Number.isInteger(s[key]) && s[key] >= min && s[key] <= max)) return false;
  if (s.sol > LIMITS.sols && s.phase !== 'finished') return false;
  if (s.missionSnapshot != null && !validSnapshot(s.missionSnapshot)) return false;
  if (s.spaceTrace !== undefined && (!Array.isArray(s.spaceTrace) || s.spaceTrace.length>100 || !s.spaceTrace.every(entry=>Number.isInteger(entry.sol)&&entry.sol>=1&&entry.sol<=14&&entry.snapshotID===s.missionSnapshot?.snapshotID&&['space-v1','space-v2'].includes(entry.ruleVersion)&&typeof entry.choice==='string'&&entry.choice.length<=100&&Number.isInteger(entry.costE)&&entry.costE>=0&&entry.costE<=20))) return false;
  if (s.visualAction != null && (!validVisualAction(s.visualAction) || s.visualAction.sol>s.sol)) return false;
  if (s.eventDone !== undefined && (typeof s.eventDone !== 'boolean' || (s.eventDone !== (s.choiceId !== null)))) return false;
  if (s.dailySystems !== undefined) {
    const d=s.dailySystems;
    if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.greenhouseDisabled !== 'boolean') return false;
    const limits={spares:[0,20],generationCap:[0,6],trackingCap:[0,6],supportExtra:[0,2],careCost:[3,4],harvestFood:[0,32],labUntil:[0,16],antennaLimit:[0,30]};
    if (!Object.entries(limits).every(([key,[min,max]]) => Number.isInteger(d[key]) && d[key]>=min && d[key]<=max)) return false;
    if (Object.keys(d).length !== 9) return false;
  }
  if (!['event','work','end','finished'].includes(s.phase) || !eventIds.includes(s.currentEventId)) return false;
  if (!['lifeSupportPaid','dusty','shielded'].every(key => typeof s[key] === 'boolean')) return false;
  if (![null,'success','incomplete','sacrifice','unsafe'].includes(s.outcome) || (s.phase === 'finished') !== (s.outcome !== null)) return false;
  if (!s.tools || Object.keys(s.tools).length !== 2 || !Object.entries(s.tools).every(([id,status]) => toolIds.includes(id) && ['ready','damaged','consumed'].includes(status))) return false;
  if (!s.history || typeof s.history !== 'object' || Array.isArray(s.history) || !Object.entries(s.history).every(([id,sol]) => eventIds.includes(id) && Number.isInteger(sol) && sol >= 1 && sol <= s.sol)) return false;
  if (!Array.isArray(s.queue) || s.queue.length !== 0) return false; // 后续事件队列为后续内容扩展保留。
  if (!Array.isArray(s.log) || s.log.length > 500 || !s.log.every(item => item && Number.isInteger(item.sol) && item.sol >= 1 && item.sol <= s.sol && typeof item.text === 'string')) return false;
  return [s.choiceId,s.workId].every(value => value === null || typeof value === 'string');
}
