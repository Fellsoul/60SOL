import { dailyState } from './DailyEventRules.js';
import { LIMITS, logEntry } from './state.js';

export function beginSol(state, events, environment = {}) {
  state.weather = environment.days?.[String(state.sol)] ?? environment.default ?? 'clear';
  if (state.weather === 'sandstorm') state.dusty = true;
  state.daySummary = [];
  state.eventDone = false;
  const systems = dailyState(state);
  state.generation = Math.min(systems.generationCap,systems.trackingCap,state.dusty ? 3 : 6);
  state.energy = Math.min(LIMITS.energy,state.energy + state.generation);
  const support = 3 + systems.supportExtra;
  state.lifeSupportPaid = state.energy >= support;
  state.energy = Math.max(0,state.energy - support);
  state.choiceId = null;
  state.workId = null;
  state.currentEventId = events.select(state);
  state.phase = 'event';
  logEntry(state,`晨报：发电 ${state.generation} E，生命维持${state.lifeSupportPaid ? '已支付 '+support+' E' : '供电不足'}，可用 ${state.energy} E。`);
}

export function finishSol(state) {
  // 工作已在确认时结算；通信先于最终结局、收获先于食物消耗。
  if (state.lightsOn) {
    if (state.energy > 0) { state.energy -= 1; state.daySummary.push('summary.lightingCost'); }
    if (state.energy === 0) { state.lightsOn = false; state.daySummary.push('summary.lightsPowerLost'); }
  }
  if (state.pendingData) logEntry(state,`地球确认收到 ${state.pendingData} 点科研数据。`);
  if (state.pendingData) state.daySummary.push('summary.transmissionConfirmed');
  state.sentData += state.pendingData;
  state.pendingData = 0;
  const hungry = state.food < 2;
  state.food = Math.max(0,state.food-2);
  if (hungry) { state.health = Math.max(0,state.health-12); logEntry(state,'食物不足，人员状态 −12。'); }
  state.powerFailures = state.lifeSupportPaid ? 0 : state.powerFailures+1;
  if (!state.lifeSupportPaid) { state.health = Math.max(0,state.health-15); logEntry(state,'生命维持供电不足，人员状态 −15。'); }
  if (hungry) state.daySummary.push('summary.foodShortage');
  if (!state.lifeSupportPaid) state.daySummary.push('summary.lifeSupportFailure');
  if (state.weather === 'sandstorm') state.daySummary.push('summary.stormDust');
  state.previousDaySummary = [...state.daySummary];
  state.summarySol = state.sol;
  logEntry(state,`日终：食物 ${state.food} F，人员状态 ${state.health}，已传回数据 ${state.sentData}。`);
  if (state.health === 0 || state.powerFailures >= 2) state.outcome = 'unsafe';
  else if (state.sol === LIMITS.sols) state.outcome = state.sentData >= LIMITS.target ? 'success' : 'incomplete';
  if (state.outcome) state.phase = 'finished';
}
