import { LIMITS, logEntry } from './state.js';

// 规则保留数值，终端只使用 narrative 和 summaryLine。
const NARRATIVES = {
  grow: ['action.grow.narrative','action.grow.summary'],
  research: ['action.research.narrative','action.research.summary'],
  transmit: ['action.transmit.narrative','action.transmit.summary'],
  clean: ['action.clean.narrative','action.clean.summary'],
  repair: ['action.repair.narrative','action.repair.summary'],
  rest: ['action.rest.narrative','action.rest.summary'],
  robot: ['action.robot.narrative','action.robot.summary'],
  monitor: ['action.monitor.narrative','action.monitor.summary'],
  shield: ['action.shield.narrative','action.shield.summary'],
  standby: ['action.standby.narrative','action.standby.summary'],
  lights_off: ['action.lights_off.narrative','action.lights_off.summary'],
  lights_on: ['action.lights_on.narrative','action.lights_on.summary'],
};
export const ACTIONS = Object.freeze([
  { id:'grow', label:'action.grow.label', energy:3, description:'照料 +1；累计 3 次获得 8 F。', facility:'greenhouse' },
  { id:'research', label:'action.research.label', energy:3, description:'本地科研数据 +12。', facility:'cabin' },
  { id:'transmit', label:'action.transmit.label', energy:2, description:'最多发送 30 点；日终确认计入目标。', facility:'antenna' },
  { id:'clean', label:'action.clean.label', energy:2, description:'清除积尘，次日起恢复 6 E 发电。', facility:'solar' },
  { id:'repair', label:'action.repair.label', energy:2, description:'本骨架支持维修积尘面板；需要工具箱。', facility:'solar', tool:'toolkit' },
  { id:'rest', label:'action.rest.label', energy:1, description:'人员状态 +8，上限 100。', facility:'cabin' },
  { id:'robot', label:'action.robot.label', energy:4, description:'本地数据 +12；基础示例暂不含故障概率。', tool:'robot' },
  { id:'monitor', label:'action.monitor.label', energy:2, description:'本地数据 +6；不会降低辐射。', tool:'monitor' },
  { id:'shield', label:'action.shield.label', energy:0, description:'消耗加固包和今日工作；永久保留屏蔽状态。', tool:'shield' },
  { id:'standby', label:'action.standby.label', energy:0, description:'保留电力；日终仍消耗食物。' },
].map(action => ({...action,narrative:NARRATIVES[action.id][0],summaryLine:NARRATIVES[action.id][1]})));

export const LIGHT_ACTIONS = Object.freeze([
  {id:'lights_off',label:'action.lights_off.label',narrative:'action.lights_off.narrative',summaryLine:'summary.lightsSwitchedOff'},
  {id:'lights_on',label:'action.lights_on.label',narrative:'action.lights_on.narrative',summaryLine:'summary.lightsSwitchedOn'},
]);

export function unavailableReason(state, action) {
  if (state.phase === 'event') return 'error.eventFirst';
  if (state.phase === 'finished') return 'error.missionFinished';
  if (state.phase !== 'work') return 'error.workUsed';
  if (action.tool && state.tools[action.tool] !== 'ready') return 'error.toolUnavailable';
  if (state.energy < action.energy) return 'error.powerInsufficient';
  if (action.id === 'transmit' && state.localData === 0) return 'error.noLocalData';
  if (['clean','repair'].includes(action.id) && !state.dusty) return 'error.panelsClean';
  if (state.weather === 'sandstorm' && ['clean','repair','robot'].includes(action.id)) return 'error.stormOutside';
  return '';
}

const effects = {
  grow(s) {
    s.growth += 1;
    s.plantStage = ['seed','sprout','growing','mature'][s.growth];
    if (s.growth === 3) {
      s.growth = 0;
      const gain = Math.min(8,LIMITS.food-s.food); s.food += gain;
      s.daySummary.push('summary.harvest');
      logEntry(s,`温室完成收获，实际入库 ${gain} F。`);
    }
  },
  research(s) { s.localData += 12; },
  robot(s) { s.localData += 12; },
  monitor(s) { s.localData += 6; },
  transmit(s) { const amount = Math.min(30,s.localData); s.localData -= amount; s.pendingData += amount; },
  clean(s) { s.dusty = false; },
  repair(s) { s.dusty = false; },
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
