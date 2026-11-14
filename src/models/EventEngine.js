import { eventEligible, choiceReason } from './DailyEventRules.js';
// 随机状态随游戏存档；刷新不会重新抽卡。
function random(state) {
  state.rng = (Math.imul(1664525,state.rng) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

export class EventEngine {
  constructor(events) { this.events = events; }
  get(id) { return this.events.find(event => event.id === id); }
  select(state) {
    const daily = this.events.filter(event => event.dailySol && event.choices.length && eventEligible(state,event));
    if (daily.length) {
      const affordable = event => event.choices.some(choice => !choiceReason(state,choice));
      // A scheduled case has priority over weather and legacy tutorials. A missed
      // prerequisite uses another playable case, never a blank or locked card.
      const scheduled = daily.find(event => event.dailySol === state.sol && affordable(event));
      const candidates = daily.filter(event => event.dailySol <= state.sol && affordable(event));
      const selected = scheduled ?? candidates.find(event => !state.history[event.id]) ??
        candidates.find(event => event.id === 'E14') ?? candidates[0];
      if (selected) { state.history[selected.id] = state.sol; return selected.id; }
    }
    const tutorial = this.events.find(event => event.tutorialSol === state.sol);
    let selected = tutorial ?? this.events.find(event => event.environment === state.weather);
    if (!selected) {
      const pool = this.events.filter(event => !event.opportunity && !event.tutorialSol && !event.environment && (event.minSol ?? 1) <= state.sol && (!event.requiresClean || !state.dusty) && (event.fallback || state.sol - (state.history[event.id] ?? -99) >= (event.cooldown ?? 3)));
      let draw = random(state) * pool.reduce((sum,event) => sum + event.weight,0);
      selected = pool.find(event => (draw -= event.weight) < 0) ?? this.events.find(event => event.fallback);
    }
    if (!selected) throw new Error('事件库缺少保底事件');
    state.history[selected.id] = state.sol;
    return selected.id;
  }
}
