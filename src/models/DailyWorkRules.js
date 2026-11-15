import { eventResolved } from './DailyEventRules.js';
import { ACTIONS, unavailableReason } from './ActionRules.js';

// Standby is the fallback when no activity can run, not an unspent action.
export function dailyActivitiesComplete(state,event) {
  if (!state || state.phase === 'finished' || !eventResolved(state,event) ||
    (state.concurrentEvents ?? []).some(instance => !instance.choiceId)) return false;
  return Boolean(state.workId) || !ACTIONS.some(action => action.id !== 'standby' &&
    !unavailableReason(state,action,event));
}
