import { LIMITS } from './state.js';

export const DAILY_DEFAULTS = Object.freeze({spares:2,generationCap:6,trackingCap:6,supportExtra:0,careCost:3,harvestFood:8,labUntil:0,greenhouseDisabled:false,antennaLimit:30});
export function dailyState(state) { return state.dailySystems ??= {...DAILY_DEFAULTS}; }
export function eventResolved(state,event) {
  return state.eventDone !== false && Boolean(state.choiceId && event?.choices.some(choice => choice.id === state.choiceId));
}
export function eventEligible(state,event) {
  return (!event.dailyRequires?.growth || state.growth >= event.dailyRequires.growth) &&
    (!event.dailyRequires?.data || state.localData >= event.dailyRequires.data) &&
    (!event.dailyRequires?.greenhouse || !dailyState(state).greenhouseDisabled);
}
export function choiceReason(state,choice) {
  if (choice.work && state.workId) return 'error.workUsed';
  if (state.energy < choice.energy) return 'error.powerInsufficient';
  if (choice.tool && state.tools[choice.tool] !== 'ready') return 'error.toolUnavailable';
  if (state.health <= (choice.costH ?? 0)) return 'error.conditionInsufficient';
  if (dailyState(state).spares < (choice.costQ ?? 0)) return 'error.sparesInsufficient';
  if (choice.outside && state.weather === 'sandstorm') return 'error.stormOutside';
  return '';
}
export function applyDailyChoice(state,choice) {
  const systems = dailyState(state);
  state.health -= choice.costH ?? 0; systems.spares -= choice.costQ ?? 0;
  for (const effect of choice.dailyEffects ?? []) {
    switch (effect.op) {
      case 'add': {
        const cap = {food:LIMITS.food,health:LIMITS.health,localData:10000}[effect.resource];
        if (cap === undefined) throw new Error('Invalid daily resource');
        state[effect.resource] = Math.max(0,Math.min(cap,state[effect.resource]+effect.amount)); break;
      }
      case 'set':
        if (!Object.hasOwn(DAILY_DEFAULTS,effect.key)) throw new Error('Invalid daily system');
        systems[effect.key] = effect.value; break;
      case 'generation': systems.generationCap = Math.min(systems.generationCap,effect.value); break;
      case 'spare': systems.spares = Math.min(20,systems.spares+effect.amount); break;
      case 'cropReset': state.growth=0; state.plantStage='seed'; break;
      case 'labPause': systems.labUntil=state.sol+effect.days; break;
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
