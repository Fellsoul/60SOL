import { outsideBlocked } from './SpaceData.js';

export const CREW_IDS = Object.freeze(['astronaut-a','astronaut-b']);
export const SAMPLE_CAPACITY = 3;
export const ROBOT_SAMPLE_ENERGY = 4;
export const freshCrew = () => Object.fromEntries(CREW_IDS.map(id => [id,{departSol:null,returnSol:null,fatigue:0}]));
export const crewAway = (state,id) => {
  const crew = state.crew?.[id];
  return Boolean(crew?.returnSol && state.sol >= crew.departSol && state.sol < crew.returnSol);
};
export const crewFatigued = (state,id) => (state.crew?.[id]?.fatigue ?? 0) > 0;
export const researchUses = state => (state.samples ?? []).reduce((total,uses) => total+uses,0);
export function collectSample(state) {
  if (state.samples.length >= SAMPLE_CAPACITY) return false;
  state.samples.push(2);
  return true;
}
export function consumeSample(state) {
  if (!state.samples.length) throw new Error('error.noSamples');
  state.samples[0] -= 1;
  if (state.samples[0] === 0) state.samples.shift();
}
export function expeditionReason(state,id) {
  if (!state || state.phase === 'finished') return 'error.missionFinished';
  if (!CREW_IDS.includes(id)) return 'error.crewUnavailable';
  if (state.sol > 12) return 'error.expeditionTooLate'; // Return before the 14-Sol mission ends.
  if (crewAway(state,id)) return 'error.crewAway';
  if (crewFatigued(state,id)) return 'error.crewFatigued';
  if (state.samples.length >= SAMPLE_CAPACITY) return 'error.samplesFull';
  return '';
}
export function robotSampleReason(state,event = null) {
  if (!state || state.phase === 'finished') return 'error.missionFinished';
  if (state.tools.robot !== 'ready') return 'error.toolUnavailable';
  if (state.robotSampleSol === state.sol) return 'error.robotAlreadyCollected';
  if (state.samples.length >= SAMPLE_CAPACITY) return 'error.samplesFull';
  if (state.phase === 'event' && event?.blockedWork?.includes('robot')) return event.blockReason;
  if (state.weather === 'sandstorm') return 'error.stormOutside';
  if (state.energy < ROBOT_SAMPLE_ENERGY) return 'error.powerInsufficient';
  return '';
}

// Run once on a new morning. Loading a saved Sol never repeats collection.
export function advanceExpeditions(state,event = null) {
  for (const id of CREW_IDS) {
    const crew = state.crew[id];
    if (crew.returnSol !== null && crew.returnSol <= state.sol) {
      const collected = collectSample(state);
      crew.departSol = null; crew.returnSol = null; crew.fatigue = 4;
      state.daySummary.push(`expedition.return.${id.replaceAll('-','_')}`);
      if (!collected) state.daySummary.push('expedition.storageFull');
    }
  }
  const plan = state.expeditionPlan;
  if (!plan || plan.departSol > state.sol) return;
  state.expeditionPlan = null;
  if (state.weather === 'sandstorm' || outsideBlocked(state) || event?.blockedWork?.includes('clean')) {
    state.daySummary.push('expedition.cancelledWeather'); return;
  }
  if (state.samples.length >= SAMPLE_CAPACITY) {
    state.daySummary.push('expedition.cancelledFull'); return;
  }
  const crew = state.crew[plan.crewId];
  crew.departSol = state.sol; crew.returnSol = state.sol+1;
  state.daySummary.push(`expedition.depart.${plan.crewId.replaceAll('-','_')}`);
}

export function recoverCrew(state,lit) {
  for (const id of CREW_IDS) {
    const crew=state.crew[id];
    if (!crewAway(state,id) && crew.fatigue > 0) {
      crew.fatigue = Math.max(0,crew.fatigue-(lit ? 2 : 1));
      if (!crew.fatigue) state.daySummary.push(`expedition.recovered.${id.replaceAll('-','_')}`);
    }
  }
}
