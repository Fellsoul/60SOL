import { spaceHeating } from './SpaceData.js';
import { dailyState } from './DailyEventRules.js';
import { LIMITS, logEntry } from './state.js';
import { resourceSnapshot, recordResourceChange } from './ResourceLog.js';
import { advanceExpeditions, recoverCrew, CREW_IDS } from './ExpeditionRules.js';
import { beginConcurrentEvents } from './ConcurrentEvents.js';
import { archiveSol } from './MissionJournal.js';
import { endForCrewFailure } from './EndingRules.js';
import { difficultyRules, solarGeneration } from './DifficultyRules.js';

export function beginSol(state, events, environment = {}, resourceLog = {}) {
  state.weather = environment.days?.[String(state.sol)] ?? environment.default ?? 'clear';
  if (state.weather === 'sandstorm') state.dusty = true;
  state.daySummary = [];
  state.resourceLog = [];
  state.eventDone = false;
  const systems = dailyState(state);
  let before = resourceSnapshot(state);
  state.generation = solarGeneration(state,systems);
  state.energy = Math.min(LIMITS.energy,state.energy + state.generation);
  recordResourceChange(state,before,'generation',resourceLog);
  const support = difficultyRules(state).lifeSupport + systems.supportExtra + spaceHeating(state,systems);
  state.lifeSupportPaid = state.energy >= support;
  before = resourceSnapshot(state);
  state.energy = Math.max(0,state.energy - support);
  recordResourceChange(state,before,state.lifeSupportPaid ? 'lifeSupport' : 'lifeSupportPartial',resourceLog);
  state.choiceId = null;
  state.workId = null;
  state.workIds = [];
  state.currentEventId = events.select(state);
  const expeditionBefore = resourceSnapshot(state);
  advanceExpeditions(state,events.get(state.currentEventId));
  beginConcurrentEvents(state,events);
  recordResourceChange(state,expeditionBefore,'expedition.return',resourceLog,'expedition.samplesReturned');
  state.phase = 'event';
  logEntry(state,`晨报：发电 ${state.generation} E，生命维持${state.lifeSupportPaid ? '已支付 '+support+' E' : '供电不足'}，可用 ${state.energy} E。`);
  endForCrewFailure(state,events);
}

export function finishSol(state, resourceLog = {}, events) {
  if (state.outcome || endForCrewFailure(state,events)) return;
  let before = resourceSnapshot(state);
  // 工作已在确认时结算；通信先于最终结局、收获先于食物消耗。
  const lit = state.lightsOn && state.energy > 0;
  recoverCrew(state,lit,state.food >= 4 * CREW_IDS.length);
  if (state.lightsOn) {
    if (state.energy > 0) state.energy -= 1;
    if (state.energy === 0) { state.lightsOn = false; state.daySummary.push('summary.lightsPowerLost'); }
  }
  recordResourceChange(state,before,'lighting',resourceLog,'summary.lightingCost');
  if (state.pendingData) logEntry(state,`地球确认收到 ${state.pendingData} 点科研数据。`);
  if (state.pendingData) state.daySummary.push('summary.transmissionConfirmed');
  before = resourceSnapshot(state);
  state.sentData += state.pendingData;
  state.pendingData = 0;
  recordResourceChange(state,before,'transmissionConfirmed',resourceLog,'summary.transmissionConfirmed');
  const meals = CREW_IDS.length * 4;
  const hungry = state.food < meals;
  before = resourceSnapshot(state);
  state.food = Math.max(0,state.food-meals);
  recordResourceChange(state,before,'meals',resourceLog);
  before = resourceSnapshot(state);
  if (hungry) { state.health = Math.max(0,state.health-12); logEntry(state,'食物不足，人员状态 −12。'); }
  recordResourceChange(state,before,'hunger',resourceLog,'summary.foodShortage');
  before = resourceSnapshot(state);
  state.powerFailures = state.lifeSupportPaid ? 0 : state.powerFailures+1;
  recordResourceChange(state,before,'powerFailures',resourceLog);
  before = resourceSnapshot(state);
  if (!state.lifeSupportPaid) { state.health = Math.max(0,state.health-15); logEntry(state,'生命维持供电不足，人员状态 −15。'); }
  recordResourceChange(state,before,'supportDamage',resourceLog,'summary.lifeSupportFailure');
  if (hungry) state.daySummary.push('summary.foodShortage');
  if (!state.lifeSupportPaid) state.daySummary.push('summary.lifeSupportFailure');
  if (state.weather === 'sandstorm') state.daySummary.push('summary.stormDust');
  logEntry(state,`日终：食物 ${state.food} F，人员状态 ${state.health}，已传回数据 ${state.sentData}。`);
  endForCrewFailure(state,events);
  if (!state.outcome && state.sol === LIMITS.sols) state.outcome = state.sentData >= LIMITS.target ? 'success' : 'incomplete';
  if (state.outcome) state.phase = 'finished';
  archiveSol(state,events);
  // SOL 15 is an ending marker: no new weather, generation, events or meals run.
  if (state.sol === LIMITS.sols) state.sol += 1;
}
