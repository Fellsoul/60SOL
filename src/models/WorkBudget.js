import { CREW_IDS, crewAway, crewFatigued, crewUnconscious } from './ExpeditionRules.js';

export function workLimit(state) {
  return CREW_IDS.every(id=>!crewAway(state,id)&&!crewFatigued(state,id)&&!crewUnconscious(state,id)) ? 2 : 1;
}
export function workHistory(state) {
  // Older saves retain only their last assignment. Count it, never grant a fresh slot.
  if (state.workIds?.length && state.workIds.at(-1)===state.workId) return state.workIds;
  return state.workId ? [state.workId] : [];
}
export const workRemaining = state => Math.max(0,workLimit(state)-workHistory(state).length);
export function spendWork(state,id) {
  state.workIds=[...workHistory(state),id];
  state.workId=id;
}
