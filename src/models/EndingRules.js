import { CREW_IDS, crewUnconscious } from './ExpeditionRules.js';
import { LIMITS } from './state.js';
import { archiveSol } from './MissionJournal.js';

export const ENDING_ART = Object.freeze({success:'TGE', incomplete:'GE', sacrifice:'GEQ', unsafe:'BE'});
export const crewFailed = state => state.health === 0 || CREW_IDS.every(id => crewUnconscious(state,id));

export function endForCrewFailure(state, events) {
  if (state.outcome || !crewFailed(state)) return false;
  // Only data already received on Earth counts, even when the crew fails early.
  state.outcome = state.sentData >= LIMITS.target ? 'sacrifice' : 'unsafe';
  state.phase = 'finished';
  state.daySummary.push(state.health === 0 ? 'summary.crewLost' : 'summary.allCrewUnconscious');
  archiveSol(state,events);
  return true;
}
