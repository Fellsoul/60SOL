// Semantic presentation records are committed with gameplay, never by animation callbacks.
import { CREW_IDS, crewAway, crewFatigued, crewUnconscious } from './ExpeditionRules.js';
import { workHistory } from './WorkBudget.js';
const WORK_STATIONS = Object.freeze({grow:'greenhouse',research:'lab',transmit:'communications',clean:'exterior',repair:'exterior',rest:'desk',robot:'communications',monitor:'communications',shield:'desk',standby:'desk'});
const EVENT_STATIONS = Object.freeze({emergency_clean:'exterior',E01:'exterior',E02:'exterior',E04:'greenhouse',E07:'lab',E08:'desk',E09:'greenhouse',E11:'greenhouse',E12:'lab',E14:'lab',E15:'lab',E16:'communications',E17:'lab',E19:'shelter'});
const STATIONS = ['desk','greenhouse','lab','communications','exterior','shelter'];

export function recordVisualAction(state,{action,label,summary,energy,condition=0,spares=0,eventId=null,choiceId=null}) {
  const available = CREW_IDS.filter(id => !crewAway(state,id) && !crewUnconscious(state,id));
  if (!available.length) { state.visualAction = null; return; }
  const rested=available.filter(id=>!crewFatigued(state,id));
  const actors=rested.length ? rested : available;
  const assignment=workHistory(state).length;
  let station = WORK_STATIONS[action] ?? EVENT_STATIONS[eventId] ?? 'desk';
  if (eventId === 'E15' && choiceId === 'replace') station = 'exterior';
  if (action === 'force_repair') station = 'exterior';
  if (action === 'rest' || choiceId === 'rest') station = 'desk';
  state.visualAction = {
    id:`sol:${state.sol}:${state.currentEventId}:${state.workId}:${assignment}`,
    actorId:actors[Math.max(0,assignment-1)%actors.length],sol:state.sol,label,summary,station,
    mode:station === 'exterior' ? 'eva' : 'interior',
    cost:{energy,condition,spares,work:1},
    terminal:{location:'desk',outfit:'indoor',outsideVisible:false},
  };
}

export function validVisualAction(plan) {
  if (!plan || typeof plan !== 'object' || typeof plan.id !== 'string' || plan.id.length>200) return false;
  if (!CREW_IDS.includes(plan.actorId) || !Number.isInteger(plan.sol) || plan.sol<1 || plan.sol>14) return false;
  if (!STATIONS.includes(plan.station) || plan.mode !== (plan.station === 'exterior' ? 'eva' : 'interior')) return false;
  if (![plan.label,plan.summary].every(value=>typeof value==='string' && value.length>0 && value.length<=200)) return false;
  if (!plan.cost || !['energy','condition','spares'].every(key=>Number.isInteger(plan.cost[key]) && plan.cost[key]>=0 && plan.cost[key]<=100) || plan.cost.work!==1) return false;
  return plan.terminal?.location==='desk' && plan.terminal.outfit==='indoor' && plan.terminal.outsideVisible===false;
}
