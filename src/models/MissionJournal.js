import { concurrentEvent } from './ConcurrentEvents.js';

// Older saves only retained yesterday. Preserve what exists without inventing earlier days.
export function ensureMissionJournal(state) {
  if (state.missionJournal !== undefined) return;
  state.missionJournal = state.summarySol > 0 ? [{
    sol:state.summarySol, summary:[...state.previousDaySummary],
    resources:structuredClone(state.previousResourceLog ?? []), events:[],
  }] : [];
}

export function archiveSol(state, events) {
  ensureMissionJournal(state);
  const records = [];
  const record = (event, choiceId) => {
    if (!event) return;
    const choice = event.choices.find(item => item.id === choiceId);
    records.push({eventId:event.id, summaryLine:event.endingSummary ?? event.summaryLine,
      choiceId:choice?.id ?? null, choiceSummary:choice?.summaryLine ?? null});
  };
  if (events) {
    record(events.get(state.currentEventId),state.choiceId);
    for (const instance of state.concurrentEvents ?? []) record(concurrentEvent(instance,events),instance.choiceId);
    if (state.history.emergency_clean === state.sol && state.currentEventId !== 'emergency_clean') {
      const event = events.get('emergency_clean');
      record(event,event?.choices.find(choice => state.daySummary.includes(choice.summaryLine))?.id);
    }
  }
  state.previousDaySummary = [...state.daySummary];
  state.previousResourceLog = structuredClone(state.resourceLog ?? []);
  state.summarySol = state.sol;
  const entry = {sol:state.sol, summary:[...state.daySummary],
    resources:structuredClone(state.resourceLog ?? []), events:records};
  const index = state.missionJournal.findIndex(day => day.sol === state.sol);
  if (index < 0) state.missionJournal.push(entry);
  else state.missionJournal[index] = entry;
}
