import { validSnapshot, recordSpaceDecision } from './SpaceData.js';
import { recordVisualAction } from './VisualAction.js';
import { applyDailyChoice, choiceReason, choiceEnergy, eventResolved, dailyState, emergencyCleanAvailable } from './DailyEventRules.js';
import { createState, logEntry, LIMITS } from './state.js';
import { ACTIONS, LIGHT_ACTIONS, applyEffect, unavailableReason, workEnergy } from './ActionRules.js';
import { EventEngine } from './EventEngine.js';
import { beginSol, finishSol } from './TurnEngine.js';
import { resourceSnapshot, recordResourceChange } from './ResourceLog.js';
import { freshCrew, expeditionReason, robotSampleReason, collectSample, ROBOT_SAMPLE_ENERGY } from './ExpeditionRules.js';
import { concurrentEvent, concurrentChoiceReason, syncFatigueEvents } from './ConcurrentEvents.js';
import { dailyActivitiesComplete } from './DailyWorkRules.js';
import { ensureMissionJournal } from './MissionJournal.js';
import { endForCrewFailure } from './EndingRules.js';

export class GameModel {
  #state = null;
  constructor({ events, tools, environment = {}, resource_log = {} }) { this.events = new EventEngine(events); this.tools = tools; this.environment = environment; this.resourceLog = resource_log; }
  get snapshot() { return this.#state ? structuredClone(this.#state) : null; }
  restore(state) {
    this.#state = structuredClone(state);
    if (this.#state) {
      this.#state.difficulty ??= 'medium';
      this.#state.samples ??= []; this.#state.crew ??= freshCrew();
      this.#state.expeditionPlan ??= null; this.#state.robotSampleSol ??= null;
      ensureMissionJournal(this.#state);
      syncFatigueEvents(this.#state, this.events);
      endForCrewFailure(this.#state,this.events);
    }
  }
  planExpedition(crewId) {
    const s=this.#state;
    if (!s || s.phase === 'finished') throw new Error('error.missionFinished');
    if (crewId !== null) {
      const reason=expeditionReason(s,crewId);
      if (reason) throw new Error(reason);
    }
    s.expeditionPlan = crewId === null ? null : {crewId,departSol:s.sol+1};
    s.daySummary=s.daySummary.filter(line => !line.startsWith('expedition.plan.') && line !== 'expedition.planCancelled');
    s.daySummary.push(crewId === null ? 'expedition.planCancelled' : `expedition.plan.${crewId.replaceAll('-','_')}`);
  }
  collectWithRobot() {
    const s=this.#state;
    const reason=robotSampleReason(s,s ? this.events.get(s.currentEventId) : null);
    if (reason) throw new Error(reason);
    const before=resourceSnapshot(s);
    s.energy -= ROBOT_SAMPLE_ENERGY;
    collectSample(s); s.robotSampleSol=s.sol;
    s.tools.robot = 'damaged';
    recordResourceChange(s,before,'sampling.robot',this.resourceLog,'action.robot.summary');
    s.daySummary.push('action.robot.summary');
  }
  start(toolIds,snapshot=null,difficulty='medium') {
    if (!['easy','medium','hard'].includes(difficulty)) throw new Error('Invalid difficulty');
    if(snapshot!==null&&!validSnapshot(snapshot))throw new Error('Invalid mission snapshot');
    if (toolIds.length !== 2 || new Set(toolIds).size !== 2 || !toolIds.every(id => this.tools.some(tool => tool.id === id))) throw new Error('error.chooseTwoTools');
    this.#state = createState(toolIds,snapshot?.seed);
    this.#state.difficulty = difficulty;
    this.#state.missionSnapshot=structuredClone(snapshot);
    beginSol(this.#state,this.events,this.environment,this.resourceLog);
  }
  choose(choiceId) {
    const s = this.#state;
    if (s?.phase !== 'event') throw new Error('error.notEventPhase');
    const choice = this.events.get(s.currentEventId).choices.find(item => item.id === choiceId);
    if (!choice || choiceReason(s,choice)) throw new Error('error.choiceUnavailable');
    const before = resourceSnapshot(s);
    const paidEnergy=choiceEnergy(s,choice);
    s.energy -= paidEnergy;
    applyEffect(s,choice.action);
    applyDailyChoice(s,choice);
    recordResourceChange(s,before,`event.${s.currentEventId}.${choice.id}`,this.resourceLog,choice.summaryLine);
    recordSpaceDecision(s,choice.id,paidEnergy);
    s.eventDone = true;
    s.choiceId = choiceId;
    s.daySummary.push(choice.summaryLine ?? this.events.get(s.currentEventId).summaryLine);
    if (choice.work) s.workId = `event:${choice.id}`;
    s.phase = s.workId ? 'end' : 'work';
    if (choice.work) recordVisualAction(s,{action:choice.action,label:choice.label,summary:choice.summaryLine,energy:paidEnergy,condition:choice.costH??0,spares:choice.costQ??0,eventId:s.currentEventId,choiceId:choice.id});
    logEntry(s,`事件决策：${choice.label}；消耗 ${paidEnergy} E${choice.work ? '，占用今日工作' : ''}。`);
  }
  chooseEmergencyClean(choiceId) {
    const s = this.#state;
    const event = this.events.get('emergency_clean');
    const choice = event?.choices.find(item => item.id === choiceId);
    if (!emergencyCleanAvailable(s,s ? this.events.get(s.currentEventId) : null) || s.history.emergency_clean === s.sol || !choice || choiceReason(s,choice)) throw new Error('error.choiceUnavailable');
    const before = resourceSnapshot(s);
    const paidEnergy=choiceEnergy(s,choice);
    s.energy -= paidEnergy;
    applyDailyChoice(s,choice);
    recordResourceChange(s,before,`event.${event.id}.${choice.id}`,this.resourceLog,choice.summaryLine);
    recordSpaceDecision(s,`emergency:${choice.id}`,paidEnergy);
    s.history.emergency_clean = s.sol;
    s.daySummary.push(choice.summaryLine);
    if (choice.work) {
      s.workId = `event:${choice.id}`;
      s.phase = eventResolved(s,this.events.get(s.currentEventId)) ? 'end' : 'event';
      recordVisualAction(s,{action:'clean',label:choice.label,summary:choice.summaryLine,energy:paidEnergy,condition:choice.costH??0,eventId:event.id,choiceId:choice.id});
    }
  }
  chooseConcurrent(instanceId, choiceId) {
    const s = this.#state;
    const instance = s?.concurrentEvents?.find(item => item.id === instanceId);
    if (!s || s.phase === 'finished' || !instance || instance.choiceId) throw new Error('error.choiceUnavailable');
    const event = concurrentEvent(instance, this.events);
    const choice = event?.choices.find(item => item.id === choiceId);
    if (!choice || concurrentChoiceReason(s, choice, this.events.get(s.currentEventId))) throw new Error('error.choiceUnavailable');
    const before = resourceSnapshot(s);
    const energy = choiceEnergy(s, choice);
    s.energy -= energy;
    applyEffect(s, choice.action);
    const primaryId = s.currentEventId;
    try { s.currentEventId = event.id; applyDailyChoice(s, choice); }
    finally { s.currentEventId = primaryId; }
    instance.choiceId = choice.id;
    s.daySummary.push(choice.summaryLine);
    recordResourceChange(s, before, `event.${event.id}.${choice.id}`, this.resourceLog, choice.summaryLine);
    recordSpaceDecision(s, `${instance.id}:${choice.id}`, energy);
    if (choice.work) {
      s.workId = `event:${instance.id}:${choice.id}`;
      if (eventResolved(s, this.events.get(s.currentEventId))) s.phase = 'end';
      recordVisualAction(s, { action: choice.action, label: choice.label, summary: choice.summaryLine,
        energy, condition: choice.costH ?? 0, spares: choice.costQ ?? 0, eventId: event.id, choiceId: choice.id });
    }
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
    const paidEnergy=workEnergy(s,action);
    s.energy -= paidEnergy;
    s.health -= action.costH ?? 0;
    dailyState(s).spares -= action.costQ ?? 0;
    applyEffect(s,actionId);
    recordResourceChange(s,before,`work.${actionId}`,this.resourceLog,action.summaryLine);
    s.daySummary.push(action.summaryLine);
    s.workId = actionId;
    recordSpaceDecision(s,actionId,paidEnergy);
    s.phase = eventResolved(s,event) ? 'end' : 'event';
    recordVisualAction(s,{action:actionId,label:action.label,summary:action.summaryLine,energy:paidEnergy,condition:action.costH??0,spares:action.costQ??0});
    logEntry(s,`基地工作：${action.label}；消耗 ${paidEnergy} E。${action.description ?? action.narrative}`);
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
    if (this.#state?.outcome) throw new Error('error.missionFinished');
    if (this.#state && endForCrewFailure(this.#state,this.events)) return;
    if (this.#state?.concurrentEvents?.some(instance => !instance.choiceId)) throw new Error('error.eventUnresolved');
    if (this.#state && !eventResolved(this.#state,this.events.get(this.#state.currentEventId))) throw new Error('error.eventUnresolved');
    if (this.#state?.phase === 'work' && dailyActivitiesComplete(this.#state,this.events.get(this.#state.currentEventId))) this.work('standby');
    if (this.#state?.phase !== 'end') throw new Error('error.finishDayFirst');
    finishSol(this.#state,this.resourceLog,this.events);
    if (!this.#state.outcome) { this.#state.sol += 1; beginSol(this.#state,this.events,this.environment,this.resourceLog); }
  }
}
