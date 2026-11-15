import { outsideBlocked, spaceEnergyCost } from './SpaceData.js';
import { LIMITS } from './state.js';
import { eventEnergyCost, eventEnergyChange } from './DifficultyRules.js';

export const DAILY_DEFAULTS = Object.freeze({spares:2,generationCap:6,trackingCap:6,supportExtra:0,careCost:3,harvestFood:32,labUntil:0,greenhouseDisabled:false,antennaLimit:30});
export function dailyState(state) { return state.dailySystems ??= {...DAILY_DEFAULTS}; }
export function eventResolved(state,event) {
  return state.eventDone !== false && Boolean(state.choiceId && event?.choices.some(choice => choice.id === state.choiceId));
}
export function eventEligible(state,event) {
  return (!event.dailyRequires?.growth || state.growth >= event.dailyRequires.growth) &&
    (!event.dailyRequires?.data || state.localData >= event.dailyRequires.data) &&
    (!event.dailyRequires?.greenhouse || !dailyState(state).greenhouseDisabled);
}
export function emergencyCleanAvailable(state,event = null) {
  if (state && outsideBlocked(state)) return false;
  return Boolean(state && state.phase !== 'finished' &&
    !(state.phase === 'event' && event?.blockedWork?.includes('clean')) &&
    (state.dusty || dailyState(state).generationCap < 6) &&
    (state.weather === 'sandstorm' || state.energy < 2));
}
const outdoorChoice=choice=>choice.outside || ['clean','repair'].includes(choice.action) || choice.id==='force_clean';
export function choiceEnergy(state,choice) { return choice.id === 'force_repair' ? 0 : spaceEnergyCost(state,eventEnergyCost(state,choice.energy),Boolean(outdoorChoice(choice))); }
export function choiceReason(state,choice) {
  if (choice.work && state.workId) return 'error.workUsed';
  if (outdoorChoice(choice) && outsideBlocked(state)) return 'dependency.spaceAdvisory';
  if (state.energy < choiceEnergy(state,choice)) return 'error.powerInsufficient';
  if (choice.tool && state.tools[choice.tool] !== 'ready') return 'error.toolUnavailable';
  if (state.health <= (choice.costH ?? 0)) return 'error.conditionInsufficient';
  if (dailyState(state).spares < (choice.costQ ?? 0)) return 'error.sparesInsufficient';
  if ((choice.outside || ['clean','repair'].includes(choice.action)) && !choice.allowStorm && state.weather === 'sandstorm') return 'error.stormOutside';
  return '';
}
export function applyDailyChoice(state,choice) {
  const systems = dailyState(state);
  state.health -= choice.costH ?? 0; systems.spares -= choice.costQ ?? 0;
  for (const effect of choice.dailyEffects ?? []) {
    switch (effect.op) {
      case 'add': {
        const cap = {energy:LIMITS.energy,food:LIMITS.food,health:LIMITS.health,localData:10000}[effect.resource];
        if (cap === undefined) throw new Error('Invalid daily resource');
        const amount = effect.resource === 'energy' ? eventEnergyChange(state,effect.amount) : effect.amount;
        state[effect.resource] = Math.max(0,Math.min(cap,state[effect.resource]+amount)); break;
      }
      case 'set':
        if (!Object.hasOwn(DAILY_DEFAULTS,effect.key)) throw new Error('Invalid daily system');
        systems[effect.key] = effect.value; break;
      case 'generation': systems.generationCap = Math.min(systems.generationCap,effect.value); break;
      case 'spare': systems.spares = Math.min(20,systems.spares+effect.amount); break;
      case 'cropReset': state.growth=0; state.plantStage='seed'; break;
      case 'labPause': systems.labUntil=state.sol+(state.currentEventId==='E12'&&choice.id==='ask'&&state.missionSnapshot ? state.missionSnapshot.rules.replySols : effect.days); break;
      case 'clean': state.dusty=false; systems.generationCap=6; break;
      case 'transfer': {
        const amount = Math.min(effect.limit,state.localData,30-state.pendingData);
        state.localData-=amount; state.pendingData+=amount; break;
      }
      case 'cramped':
        if (state.health>3) state.health-=3;
        else state.localData=Math.max(0,state.localData-2);
        break;
      default: throw new Error('Unknown daily effect');
    }
  }
}
