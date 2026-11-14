import { applyDailyChoice, choiceReason, eventResolved, dailyState } from './DailyEventRules.js';
import { createState, logEntry, LIMITS } from './state.js';
import { ACTIONS, LIGHT_ACTIONS, applyEffect, unavailableReason } from './ActionRules.js';
import { EventEngine } from './EventEngine.js';
import { beginSol, finishSol } from './TurnEngine.js';
import { resourceSnapshot, recordResourceChange } from './ResourceLog.js';

export class GameModel {
  #state = null;
  constructor({ events, tools, environment = {}, resource_log = {} }) { this.events = new EventEngine(events); this.tools = tools; this.environment = environment; this.resourceLog = resource_log; }
  get snapshot() { return this.#state ? structuredClone(this.#state) : null; }
  restore(state) { this.#state = structuredClone(state); }
  start(toolIds) {
    if (toolIds.length !== 2 || new Set(toolIds).size !== 2 || !toolIds.every(id => this.tools.some(tool => tool.id === id))) throw new Error('error.chooseTwoTools');
    this.#state = createState(toolIds);
    beginSol(this.#state,this.events,this.environment,this.resourceLog);
  }
  choose(choiceId) {
    const s = this.#state;
    if (s?.phase !== 'event') throw new Error('error.notEventPhase');
    const choice = this.events.get(s.currentEventId).choices.find(item => item.id === choiceId);
    if (!choice || choiceReason(s,choice)) throw new Error('error.choiceUnavailable');
    const before = resourceSnapshot(s);
    s.energy -= choice.energy;
    applyEffect(s,choice.action);
    applyDailyChoice(s,choice);
    recordResourceChange(s,before,`event.${s.currentEventId}.${choice.id}`,this.resourceLog,choice.summaryLine);
    s.eventDone = true;
    s.choiceId = choiceId;
    s.daySummary.push(choice.summaryLine ?? this.events.get(s.currentEventId).summaryLine);
    if (choice.work) s.workId = `event:${choice.id}`;
    s.phase = s.workId ? 'end' : 'work';
    logEntry(s,`事件决策：${choice.label}；消耗 ${choice.energy} E${choice.work ? '，占用今日工作' : ''}。`);
  }
  work(actionId) {
    const s = this.#state;
    const action = ACTIONS.find(item => item.id === actionId);
    if (!s || !action) throw new Error('error.unknownWork');
    const event = this.events.get(s.currentEventId);
    const reason = unavailableReason(s,action,event);
    if (reason) throw new Error(reason);
    const response = s.phase === 'event' ? event.workResolutions?.[actionId] : null;
    if (response) { this.choose(response); return; }
    const before = resourceSnapshot(s);
    s.energy -= action.id === 'grow' ? dailyState(s).careCost : action.energy;
    applyEffect(s,actionId);
    recordResourceChange(s,before,`work.${actionId}`,this.resourceLog,action.summaryLine);
    s.daySummary.push(action.summaryLine);
    s.workId = actionId;
    s.phase = eventResolved(s,event) ? 'end' : 'event';
    logEntry(s,`基地工作：${action.label}；消耗 ${action.id === 'grow' ? dailyState(s).careCost : action.energy} E。${action.description ?? action.narrative}`);
  }
  setLights(on) {
    const s = this.#state;
    if (!s || !['event','work','end'].includes(s.phase) || typeof on !== 'boolean') throw new Error('error.lightsUnavailable');
    if (s.lightsOn === on) throw new Error(on ? 'error.lightsAlreadyOn' : 'error.lightsAlreadyOff');
    if (on && s.energy === 0) throw new Error('error.powerInsufficient');
    s.lightsOn = on;
    // Repeated switching records only the final choice, keeping save summaries bounded.
    s.daySummary = s.daySummary.filter(line => !LIGHT_ACTIONS.some(action => action.summaryLine === line));
    s.daySummary.push(LIGHT_ACTIONS.find(action => action.id === (on ? 'lights_on' : 'lights_off')).summaryLine);
  }
  useBattery() {
    const s = this.#state;
    if (!s || s.phase === 'finished' || s.tools.battery !== 'ready') throw new Error('error.noBattery');
    const gain = Math.min(6,LIMITS.energy-s.energy);
    if (!gain) throw new Error('error.batteryFull');
    const before = resourceSnapshot(s);
    s.energy += gain;
    recordResourceChange(s,before,'battery',this.resourceLog,'summary.batteryConnected');
    s.tools.battery = 'consumed';
    s.daySummary.push('summary.batteryConnected');
    logEntry(s,`使用一次性备用电池，实际补充 ${gain} E。`);
  }
  nextSol() {
    if (this.#state && !eventResolved(this.#state,this.events.get(this.#state.currentEventId))) throw new Error('error.eventUnresolved');
    if (this.#state?.phase !== 'end') throw new Error('error.finishDayFirst');
    finishSol(this.#state,this.resourceLog);
    if (!this.#state.outcome) { this.#state.sol += 1; beginSol(this.#state,this.events,this.environment,this.resourceLog); }
  }
}
