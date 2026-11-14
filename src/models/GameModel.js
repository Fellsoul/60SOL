import { createState, logEntry, LIMITS } from './state.js';
import { ACTIONS, applyEffect, unavailableReason } from './ActionRules.js';
import { EventEngine } from './EventEngine.js';
import { beginSol, finishSol } from './TurnEngine.js';

export class GameModel {
  #state = null;
  constructor({ events, tools, environment = {} }) { this.events = new EventEngine(events); this.tools = tools; this.environment = environment; }
  get snapshot() { return this.#state ? structuredClone(this.#state) : null; }
  restore(state) { this.#state = structuredClone(state); }
  start(toolIds) {
    if (toolIds.length !== 2 || new Set(toolIds).size !== 2 || !toolIds.every(id => this.tools.some(tool => tool.id === id))) throw new Error('error.chooseTwoTools');
    this.#state = createState(toolIds);
    beginSol(this.#state,this.events,this.environment);
  }
  choose(choiceId) {
    const s = this.#state;
    if (s?.phase !== 'event') throw new Error('error.notEventPhase');
    const choice = this.events.get(s.currentEventId).choices.find(item => item.id === choiceId);
    if (!choice || s.energy < choice.energy) throw new Error('error.choiceUnavailable');
    s.energy -= choice.energy;
    applyEffect(s,choice.action);
    s.choiceId = choiceId;
    s.daySummary.push(choice.summaryLine ?? this.events.get(s.currentEventId).summaryLine);
    s.workId = choice.work ? `event:${choice.id}` : null;
    s.phase = choice.work ? 'end' : 'work';
    logEntry(s,`事件决策：${choice.label}；消耗 ${choice.energy} E${choice.work ? '，占用今日工作' : ''}。`);
  }
  work(actionId) {
    const s = this.#state;
    const action = ACTIONS.find(item => item.id === actionId);
    if (!s || !action) throw new Error('error.unknownWork');
    const reason = unavailableReason(s,action);
    if (reason) throw new Error(reason);
    s.energy -= action.energy;
    applyEffect(s,actionId);
    s.daySummary.push(action.summaryLine);
    s.workId = actionId;
    s.phase = 'end';
    logEntry(s,`基地工作：${action.label}；消耗 ${action.energy} E。${action.description ?? action.narrative}`);
  }
  useBattery() {
    const s = this.#state;
    if (!s || s.phase === 'finished' || s.tools.battery !== 'ready') throw new Error('error.noBattery');
    const gain = Math.min(6,LIMITS.energy-s.energy);
    if (!gain) throw new Error('error.batteryFull');
    s.energy += gain;
    s.tools.battery = 'consumed';
    s.daySummary.push('summary.batteryConnected');
    logEntry(s,`使用一次性备用电池，实际补充 ${gain} E。`);
  }
  nextSol() {
    if (this.#state?.phase !== 'end') throw new Error('error.finishDayFirst');
    finishSol(this.#state);
    if (!this.#state.outcome) { this.#state.sol += 1; beginSol(this.#state,this.events,this.environment); }
  }
}
