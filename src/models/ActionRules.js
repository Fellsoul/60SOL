import { outsideBlocked, spaceEnergyCost } from './SpaceData.js';
import { dailyState, choiceReason } from './DailyEventRules.js';
import { LIMITS, logEntry } from './state.js';
import { consumeSample, CREW_IDS, crewAway, crewFatigued, crewUnconscious } from './ExpeditionRules.js';
import { workRemaining } from './WorkBudget.js';

// 规则保留数值，终端只使用 narrative 和 summaryLine。
const NARRATIVES = {
  grow: ['action.grow.narrative','action.grow.summary'],
  research: ['action.research.narrative','action.research.summary'],
  transmit: ['action.transmit.narrative','action.transmit.summary'],
  clean: ['action.clean.narrative','action.clean.summary'],
  repair: ['action.repair.narrative','action.repair.summary'],
  force_repair: ['action.force_repair.narrative','action.force_repair.summary'],
  repair_robot: ['action.repair_robot.narrative','action.repair_robot.summary'],
  rest: ['action.rest.narrative','action.rest.summary'],
  monitor: ['action.monitor.narrative','action.monitor.summary'],
  shield: ['action.shield.narrative','action.shield.summary'],
  standby: ['action.standby.narrative','action.standby.summary'],
  lights_off: ['action.lights_off.narrative','action.lights_off.summary'],
  lights_on: ['action.lights_on.narrative','action.lights_on.summary'],
};
export const ACTIONS = Object.freeze([
  { id:'grow', label:'action.grow.label', energy:3, description:'照料 +1；累计 3 次获得 32 F。', facility:'greenhouse' },
  { id:'research', label:'action.research.label', energy:3, description:'消耗 1 个样本及当天工作；本地科研数据 +20。', facility:'cabin' },
  { id:'transmit', label:'action.transmit.label', energy:2, description:'最多发送 30 点；日终确认计入目标。', facility:'antenna' },
  { id:'clean', label:'action.clean.label', energy:2, description:'清除积尘，次日起恢复当前难度的正常发电量。', facility:'solar' },
  { id:'repair', label:'action.repair.label', energy:2, description:'本骨架支持维修积尘面板；需要工具箱。', facility:'solar', tool:'toolkit' },
  { id:'force_repair', label:'action.force_repair.label', energy:0, costH:20, facility:'solar' },
  { id:'repair_robot', label:'action.repair_robot.label', energy:0, costQ:1, facility:'cabin' },
  { id:'rest', label:'action.rest.label', energy:1, description:'人员状态 +8，上限 100。', facility:'cabin' },
  { id:'shield', label:'action.shield.label', energy:0, description:'消耗加固包和今日工作；永久保留屏蔽状态。', tool:'shield' },
  { id:'standby', label:'action.standby.label', energy:0, description:'保留电力；日终仍消耗食物。' },
].map(action => ({...action,narrative:NARRATIVES[action.id][0],summaryLine:NARRATIVES[action.id][1]})));

export const LIGHT_ACTIONS = Object.freeze([
  {id:'lights_off',label:'action.lights_off.label',narrative:'action.lights_off.narrative',summaryLine:'summary.lightsSwitchedOff'},
  {id:'lights_on',label:'action.lights_on.label',narrative:'action.lights_on.narrative',summaryLine:'summary.lightsSwitchedOn'},
]);

export function workEnergy(state,action) { return spaceEnergyCost(state,action.id==='grow' ? dailyState(state).careCost : action.energy,['clean','repair'].includes(action.id)); }

export function unavailableReason(state, action, event = null) {
  if (outsideBlocked(state) && ['clean','repair','force_repair'].includes(action.id)) return 'dependency.spaceAdvisory';
  if (state.phase === 'finished') return 'error.missionFinished';
  if (!workRemaining(state) || !['event','work','end'].includes(state.phase)) return 'error.workUsed';
  if (action.tool && state.tools[action.tool] !== 'ready') return 'error.toolUnavailable';
  if (state.health <= (action.costH ?? 0)) return 'error.conditionInsufficient';
  if (state.phase === 'event') {
    if (event?.blockedWork?.includes(action.id)) return event.blockReason;
    const response = event?.choices.find(choice => choice.id === event.workResolutions?.[action.id]);
    if (response) return choiceReason(state,response);
  }
  const systems = dailyState(state);
  if (action.id === 'repair_robot' && state.tools.robot !== 'damaged') return 'error.robotNotDamaged';
  if (systems.spares < (action.costQ ?? 0)) return 'error.sparesInsufficient';
  if (!['rest','standby'].includes(action.id) && !CREW_IDS.some(id => !crewAway(state,id) && !crewFatigued(state,id) && !crewUnconscious(state,id))) return 'error.crewResting';
  if (action.id === 'grow' && systems.greenhouseDisabled) return 'error.facilityUnavailable';
  if (action.id === 'research' && state.sol < systems.labUntil) return 'error.facilityUnavailable';
  if (state.energy < workEnergy(state,action)) return 'error.powerInsufficient';
  if (action.id === 'research' && !state.samples?.length) return 'error.noSamples';
  if (action.id === 'transmit' && systems.antennaLimit === 0) return 'error.facilityUnavailable';
  if (action.id === 'transmit' && state.localData === 0) return 'error.noLocalData';
  if (action.id === 'transmit' && state.pendingData >= systems.antennaLimit) return 'error.transmissionFull';
  if (['clean','repair','force_repair'].includes(action.id) && !state.dusty && systems.generationCap === 6 && (action.id === 'clean' || systems.trackingCap === 6)) return 'error.panelsClean';
  if (state.weather === 'sandstorm' && ['clean','repair','robot'].includes(action.id)) return 'error.stormOutside';
  return '';
}

const effects = {
  grow(s) {
    s.growth += 1;
    s.plantStage = ['seed','sprout','growing','mature'][s.growth];
    if (s.growth === 3) {
      s.growth = 0;
      const gain = Math.min(dailyState(s).harvestFood,LIMITS.food-s.food); s.food += gain;
      s.daySummary.push('summary.harvest');
      logEntry(s,`温室完成收获，实际入库 ${gain} F。`);
    }
  },
  research(s) { consumeSample(s); s.localData += 20; },
  transmit(s) { const amount = Math.min(Math.max(0,dailyState(s).antennaLimit-s.pendingData),s.localData); s.localData -= amount; s.pendingData += amount; },
  clean(s) { s.dusty = false; dailyState(s).generationCap=6; },
  repair(s) { s.dusty = false; dailyState(s).generationCap=6; dailyState(s).trackingCap=6; },
  force_repair(s) { effects.repair(s); },
  repair_robot(s) { s.tools.robot = 'ready'; },
  dust(s) { s.dusty = true; },
  rest(s) { s.health = Math.min(LIMITS.health,s.health+8); },
  shield(s) { s.shielded = true; s.tools.shield = 'consumed'; },
  standby() {},
  lights_off(s) { s.lightsOn = false; },
  lights_on(s) { s.lightsOn = true; },
};

export function applyEffect(state, id) {
  if (!id) return;
  if (!Object.hasOwn(effects,id)) throw new Error(`未知行动：${id}`);
  effects[id](state);
}
