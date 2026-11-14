import { LIMITS, logEntry } from './state.js';

// 规则保留数值，终端只使用 narrative 和 summaryLine。
const NARRATIVES = {
  grow: ['投入电力照料作物，今天不再安排其他工作。','我们照料了作物，种植槽中的叶片舒展开来。'],
  research: ['在舱内开展实验，研究记录先留存在基地。','我们在舱内完成了实验，终端保存了新的研究记录。'],
  transmit: ['把保存的研究记录发送给地球，等待日终确认。','我们将研究记录发送出去，等待地球的回应。'],
  clean: ['投入电力与今天的工作，清除面板积尘。','我们清洁了太阳能板，供电条件得到了改善。'],
  repair: ['使用工具箱维护面板，今天不再安排其他工作。','我们用工具箱维护了太阳能板。'],
  rest: ['让队员恢复精神，今天不再安排其他工作。','队员在生活舱里休息了一天，精神有所恢复。'],
  robot: ['让机器人采集样本，需要较多电力与今天的工作。','机器人完成采样，基地留下了新的研究记录。'],
  monitor: ['投入电力记录环境读数；监测仪本身不提供防护。','我们用监测仪记录了环境读数。'],
  shield: ['用今天的工作安装加固材料，工具包会从原位消失。','屏蔽材料已经安装，空出的储物位记录着这次决定。'],
  standby: ['让设备保持待命，今天不再安排工作。','我们没有开展额外工作，把电力留给了明天。'],
  lights_off: ['关闭生活舱灯光，留在舱内等待；生命维持仍然运行。','生活舱的灯熄灭了，我们在安静中度过了这一天。'],
  lights_on: ['恢复生活舱灯光并留在舱内，今天不再安排其他工作。','我们重新打开了生活舱的灯，熟悉的暖光回到房间。'],
};
export const ACTIONS = Object.freeze([
  { id:'grow', label:'照料温室', energy:3, description:'照料 +1；累计 3 次获得 8 F。', facility:'greenhouse' },
  { id:'research', label:'舱内实验', energy:3, description:'本地科研数据 +12。', facility:'cabin' },
  { id:'transmit', label:'传输数据', energy:2, description:'最多发送 30 点；日终确认计入目标。', facility:'antenna' },
  { id:'clean', label:'清洁太阳能板', energy:2, description:'清除积尘，次日起恢复 6 E 发电。', facility:'solar' },
  { id:'repair', label:'修复设施', energy:2, description:'本骨架支持维修积尘面板；需要工具箱。', facility:'solar', tool:'toolkit' },
  { id:'rest', label:'休整', energy:1, description:'人员状态 +8，上限 100。', facility:'cabin' },
  { id:'robot', label:'机器人采样', energy:4, description:'本地数据 +12；基础示例暂不含故障概率。', tool:'robot' },
  { id:'monitor', label:'监测研究', energy:2, description:'本地数据 +6；不会降低辐射。', tool:'monitor' },
  { id:'shield', label:'加固避难区', energy:0, description:'消耗加固包和今日工作；永久保留屏蔽状态。', tool:'shield' },
  { id:'standby', label:'储能待命', energy:0, description:'保留电力；日终仍消耗食物。' },
  { id:'lights_off', label:'熄灯待命', energy:0 },
  { id:'lights_on', label:'亮灯待命', energy:1 },
].map(action => ({...action,narrative:NARRATIVES[action.id][0],summaryLine:NARRATIVES[action.id][1]})));

export function unavailableReason(state, action) {
  if (state.phase === 'event') return '先处理今日事件';
  if (state.phase === 'finished') return '任务已结束';
  if (state.phase !== 'work') return '今日工作机会已使用';
  if (action.tool && state.tools[action.tool] !== 'ready') return '缺少可用工具';
  if (state.energy < action.energy) return '可用电力不足';
  if (action.id === 'transmit' && state.localData === 0) return '没有待传输的本地数据';
  if (['clean','repair'].includes(action.id) && !state.dusty) return '当前面板无需维护';
  if (state.weather === 'sandstorm' && ['clean','repair','robot'].includes(action.id)) return '沙暴期间无法开展舱外作业';
  if (action.id === 'lights_off' && !state.lightsOn) return '生活舱已经熄灯';
  if (action.id === 'lights_on' && state.lightsOn) return '生活舱已经亮灯';
  return '';
}

const effects = {
  grow(s) {
    s.growth += 1;
    s.plantStage = ['seed','sprout','growing','mature'][s.growth];
    if (s.growth === 3) {
      s.growth = 0;
      const gain = Math.min(8,LIMITS.food-s.food); s.food += gain;
      s.daySummary.push('作物已经成熟，我们收获了可以补充食物的这一批。');
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
