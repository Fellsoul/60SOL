import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { finishSol } from '../src/models/TurnEngine.js';
import { sceneState } from '../src/views/SceneState.js';

const events = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools = JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
const content = { events,tools };
function model(toolIds = ['toolkit','battery']) { const game = new GameModel(content); game.start(toolIds); return game; }
function memory() { const data = new Map(); return { getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value) }; }

test('开局先发电再支付生命维持；状态副本不能修改 Model',() => {
  const game = model();
  assert.equal(game.snapshot.energy,13);
  const external = game.snapshot; external.energy = 999;
  assert.equal(game.snapshot.energy,13);
  assert.throws(() => game.start(['battery','battery']));
});

test('事件和工作不可重复结算，一次性电池不可重复使用',() => {
  const game = model(); game.choose('grow');
  assert.equal(game.snapshot.growth,1); assert.equal(game.snapshot.energy,10);
  assert.throws(() => game.choose('grow')); assert.throws(() => game.work('research'));
  game.useBattery(); assert.equal(game.snapshot.energy,16);
  assert.throws(() => game.useBattery());
});

test('三次照料的收获先于当天食物消耗',() => {
  const game = model(); const state = game.snapshot;
  Object.assign(state,{phase:'work',choiceId:'plan',growth:2,food:0}); game.restore(state);
  game.work('grow'); assert.equal(game.snapshot.food,8);
  game.nextSol(); assert.equal(game.snapshot.food,6); assert.equal(game.snapshot.health,100);
});

test('最后一天传输先确认，再检查任务成功',() => {
  const game = model(); const state = game.snapshot;
  Object.assign(state,{sol:14,phase:'work',choiceId:'plan',localData:30,sentData:30}); game.restore(state);
  game.work('transmit'); assert.equal(game.snapshot.sentData,30); assert.equal(game.snapshot.pendingData,30);
  game.nextSol(); assert.equal(game.snapshot.sentData,60); assert.equal(game.snapshot.outcome,'success');
  assert.throws(() => game.nextSol());
});

test('零库存不等于当日供给失败，连续供电不足才提前终止',() => {
  const s = model().snapshot; Object.assign(s,{phase:'end',energy:0,food:2});
  finishSol(s); assert.equal(s.health,100); assert.equal(s.outcome,null);
  s.lifeSupportPaid = false; s.food = 10;
  finishSol(s); assert.equal(s.outcome,null); assert.equal(s.powerFailures,1);
  finishSol(s); assert.equal(s.outcome,'unsafe'); assert.ok(s.food >= 0);
});

test('存档恢复保留卡片、阶段、资源和随机状态；坏存档可降级',() => {
  const game = model(); game.choose('plan'); game.work('research'); game.nextSol();
  const storage = memory(); const repository = new SaveRepository(storage,content);
  assert.equal(repository.save(game.snapshot).ok,true);
  const loaded = repository.load(); assert.deepEqual(loaded.state,game.snapshot);
  const restored = new GameModel(content); restored.restore(loaded.state);
  assert.deepEqual(restored.snapshot,game.snapshot);
  storage.setItem(repository.key,'{broken'); assert.equal(repository.load().state,null);
  assert.equal(new SaveRepository(null,content).save(game.snapshot).ok,false);
});

test('14 天保底路径可完成任务，库存不为负',() => {
  const baseline = { events:events.filter(event => event.fallback),tools };
  const game = new GameModel(baseline); game.start(['toolkit','battery']);
  const work = ['grow','grow','grow','research','research','research','research','research','transmit','transmit','standby','standby','standby','standby'];
  for (const id of work) { game.choose('continue'); game.work(id); game.nextSol(); assert.ok(game.snapshot.food >= 0); assert.ok(game.snapshot.energy >= 0); }
  assert.equal(game.snapshot.outcome,'success'); assert.equal(game.snapshot.sentData,60);
});

test('积尘影响后续发电；恢复不会重算今日发电',() => {
  const game = model(); const s = game.snapshot;
  Object.assign(s,{sol:3,currentEventId:'dust'}); game.restore(s);
  game.choose('defer'); game.work('standby'); game.nextSol();
  assert.equal(game.snapshot.generation,3);
  const workState = game.snapshot; workState.phase = 'work'; game.restore(workState);
  const energy = game.snapshot.energy; game.work('clean');
  assert.equal(game.snapshot.energy,energy-2); assert.equal(game.snapshot.dusty,false);
  game.nextSol(); assert.equal(game.snapshot.generation,6);
});

test('没有可用工具不能采样，资源不足不能执行工作',() => {
  const game = model(); game.choose('plan');
  assert.throws(() => game.work('robot'));
  const s = game.snapshot; s.energy = 0; game.restore(s);
  assert.throws(() => game.work('research')); game.work('standby');
});

test('存档拒绝非法数值和不兼容版本',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content); const s = model().snapshot;
  for (const change of [{energy:-1},{version:999},{tools:null},{queue:[{}]},{phase:'work',choiceId:null}]) {
    storage.setItem(repo.key,JSON.stringify({...s,...change})); assert.equal(repo.load().state,null);
  }
});

test('所有事件及选项提供总结，昨日简报只记录实际选择并保留到存档',() => {
  assert.ok(events.every(event => event.summaryLine && event.choices.every(choice => choice.summaryLine)));
  const game = model(); game.choose('grow'); game.nextSol();
  assert.ok(game.snapshot.previousDaySummary.includes(events[0].choices[0].summaryLine));
  assert.ok(!game.snapshot.previousDaySummary.includes(events[0].choices[1].summaryLine));
  assert.equal(game.snapshot.summarySol,1);
  const repository = new SaveRepository(memory(),content); repository.save(game.snapshot);
  assert.deepEqual(repository.load().state.previousDaySummary,game.snapshot.previousDaySummary);
});

test('天气、灯光、植物和消耗工具投影为图片状态，不依赖动画',() => {
  const game = new GameModel({...content,environment:{default:'clear',days:{'2':'sandstorm'}}});
  game.start(['battery','toolkit']); game.choose('grow');
  assert.equal(sceneState(game.snapshot).plants,'sprout');
  game.useBattery(); assert.equal(sceneState(game.snapshot).tools.battery,'consumed');
  game.nextSol(); assert.equal(sceneState(game.snapshot).weather,'sandstorm');
  game.choose('review'); game.work('lights_off');
  assert.equal(sceneState(game.snapshot).lighting,'off');
});

test('旧存档升级，不凭空编造昨日简报',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content);
  const old = model().snapshot; old.version = 1;
  for (const key of ['weather','lightsOn','plantStage','daySummary','previousDaySummary','summarySol']) delete old[key];
  storage.setItem(repo.key,JSON.stringify(old));
  const restored = repo.load().state;
  assert.equal(restored.version,2); assert.deepEqual(restored.previousDaySummary,[]);
});
