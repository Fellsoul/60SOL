// Event adjustments apply only to nonzero changes; ordinary work keeps its own cost.
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({generation:9,lifeSupport:2,eventCost:-1,eventReward:1}),
  medium: Object.freeze({generation:8,lifeSupport:3,eventCost:0,eventReward:0}),
  hard: Object.freeze({generation:4,lifeSupport:4,eventCost:1,eventReward:-1}),
});
export function difficultyRules(state) { return DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.medium; }
export function eventEnergyCost(state,amount) {
  return amount > 0 ? Math.max(0,amount+difficultyRules(state).eventCost) : 0;
}
export function eventEnergyChange(state,amount) {
  return amount > 0 ? Math.max(0,amount+difficultyRules(state).eventReward) : -eventEnergyCost(state,-amount);
}
export function solarGeneration(state,systems) {
  // Existing panel limits use a six-unit scale: dust halves output, faults cap it.
  const capacity = Math.min(systems.generationCap,systems.trackingCap,state.dusty ? 3 : 6);
  return Math.floor(difficultyRules(state).generation*capacity/6);
}
