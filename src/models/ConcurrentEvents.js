import { choiceReason, eventEligible, eventResolved } from './DailyEventRules.js';
import { crewAway } from './ExpeditionRules.js';

export function eventPressure(sol) {
  const progress = Math.max(0, Math.min(1, (sol - 1) / 13));
  return { slots: 1 + Math.floor(3 * progress * progress), chance: .1 + .55 * progress * progress };
}

function draw(state) {
  state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

export function concurrentEvent(instance, events) {
  const base = events.get(instance.eventId);
  if (!base) return null;
  if (!instance.crewId) return base;
  return { ...base, title: 'events.fatigue.title',
    sceneCue: { kind: 'thought', anchor: instance.crewId === 'astronaut-a' ? 'crew-a' : 'crew-b', text: 'events.fatigue.cue' },
    descriptionKey: 'events.fatigue.description',
    choices: [{ id: 'recover', label: 'events.fatigue.recover', description: 'events.fatigue.description',
      energy: 0, work: false, summaryLine: 'events.fatigue.summary' }] };
}

export function concurrentChoiceReason(state, choice, primary) {
  if (choice.work && primary && !eventResolved(state, primary) &&
    !primary.choices.some(response => !response.work && !choiceReason(state, response))) {
    return 'error.eventUnresolved';
  }
  return choiceReason(state, choice);
}

export function syncFatigueEvents(state, events) {
  state.concurrentEvents ??= [];
  if (state.phase === 'finished' || !events.get('E14')) return;
  for (const [crewId, crew] of Object.entries(state.crew ?? {})) {
    if (crew.fatigue > 0 && !crewAway(state, crewId) &&
      !state.concurrentEvents.some(instance => instance.crewId === crewId)) {
      state.concurrentEvents.push({ id: `fatigue:${crewId}`, eventId: 'E14', crewId, choiceId: null });
    }
  }
}

export function beginConcurrentEvents(state, events) {
  state.concurrentEvents = [];
  // The legacy tutorial-only event collection keeps its original schedule.
  if (!events.events.some(event => event.dailySol)) return;
  syncFatigueEvents(state, events);
  const pressure = eventPressure(state.sol);
  const strain = (state.dusty ? .1 : 0) + (!state.lifeSupportPaid ? .1 : 0);
  for (let slot = 0; slot < pressure.slots; slot++) {
    if (draw(state) >= Math.min(.9, pressure.chance + strain)) continue;
    const pool = events.events.filter(event => event.dailySol && event.dailySol <= state.sol &&
      !['E14', 'E16', 'E19'].includes(event.id) && event.id !== state.currentEventId &&
      !state.concurrentEvents.some(instance => instance.eventId === event.id) &&
      state.sol - (state.history[event.id] ?? -99) >= 3 && eventEligible(state, event) &&
      event.choices.some(choice => choice.energy === 0 && choice.work === false && !choiceReason(state, choice)));
    if (!pool.length) break;
    const event = pool[Math.floor(draw(state) * pool.length)];
    state.concurrentEvents.push({ id: event.id, eventId: event.id, choiceId: null });
    state.history[event.id] = state.sol;
  }
}
