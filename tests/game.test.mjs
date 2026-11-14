import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { finishSol } from '../src/models/TurnEngine.js';
import { sceneState } from '../src/views/SceneState.js';

const events = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8')).filter(event => !event.dailySol);
const tools = JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
const content = { events,tools };
function model(toolIds = ['toolkit','battery']) { const game = new GameModel(content); game.start(toolIds); return game; }
function memory() { const data = new Map(); return { get length() { return data.size; }, key:index => [...data.keys()][index] ?? null, getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key) }; }

test('开局先发电再支付生命维持；状态副本不能修改 Model',() => {
  const game = model();
  assert.equal(game.snapshot.energy,9);
  const external = game.snapshot; external.energy = 999;
  assert.equal(game.snapshot.energy,9);
  assert.throws(() => game.start(['battery','battery']));
});

test('事件和工作不可重复结算，一次性电池不可重复使用',() => {
  const game = model(); game.choose('grow');
  assert.equal(game.snapshot.growth,1); assert.equal(game.snapshot.energy,6);
  assert.throws(() => game.choose('grow')); assert.throws(() => game.work('research'));
  game.useBattery(); assert.equal(game.snapshot.energy,12);
  assert.throws(() => game.useBattery());
});

test('三次照料的收获先于当天食物消耗',() => {
  const game = model(); const state = game.snapshot;
  Object.assign(state,{phase:'work',choiceId:'plan',eventDone:true,growth:2,food:0}); game.restore(state);
  game.work('grow'); assert.equal(game.snapshot.food,8);
  game.nextSol(); assert.equal(game.snapshot.food,6); assert.equal(game.snapshot.health,100);
});

test('最后一天传输先确认，再检查任务成功',() => {
  const game = model(); const state = game.snapshot;
  Object.assign(state,{sol:14,phase:'work',choiceId:'plan',eventDone:true,localData:30,sentData:30}); game.restore(state);
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
  const saved = repository.save(game.snapshot); assert.equal(saved.ok,true);
  const loaded = repository.load(saved.id); assert.deepEqual(loaded.state,game.snapshot);
  const restored = new GameModel(content); restored.restore(loaded.state);
  assert.deepEqual(restored.snapshot,game.snapshot);
  storage.setItem(saved.id,'{broken'); assert.equal(repository.load(saved.id).state,null);
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
  const nextEvent = game.events.get(game.snapshot.currentEventId);
  game.choose(nextEvent.choices.find(choice => !choice.work).id);
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
  const repository = new SaveRepository(memory(),content); const saved = repository.save(game.snapshot);
  assert.deepEqual(repository.load(saved.id).state.previousDaySummary,game.snapshot.previousDaySummary);
});

test('天气、灯光、植物和消耗工具投影为图片状态，不依赖动画',() => {
  const game = new GameModel({...content,environment:{default:'clear',days:{'2':'sandstorm'}}});
  game.start(['battery','toolkit']); game.choose('grow');
  assert.equal(sceneState(game.snapshot).plants,'sprout');
  game.useBattery(); assert.equal(sceneState(game.snapshot).tools.battery,'consumed');
  game.nextSol(); assert.equal(sceneState(game.snapshot).weather,'sandstorm');
  game.choose('review'); game.setLights(false);
  assert.equal(sceneState(game.snapshot).lighting,'off');
});

test('旧存档升级，不凭空编造昨日简报',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content);
  const old = model().snapshot; old.version = 1;
  for (const key of ['weather','lightsOn','plantStage','daySummary','previousDaySummary','summarySol']) delete old[key];
  storage.setItem(repo.key,JSON.stringify(old));
  const restored = repo.load().state;
  assert.equal(restored.version,3); assert.deepEqual(restored.previousDaySummary,[]);
  assert.equal(repo.save(restored,repo.key).ok,true);
  assert.deepEqual(repo.load(repo.key).state,restored); assert.equal(repo.list().saves.length,1);
});

test('不同任务独立保存，加载指定存档后仅更新该任务',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content);
  const first = model(); const second = model(['robot','shield']);
  const a = repo.save(first.snapshot); const b = repo.save(second.snapshot);
  assert.equal(a.ok,true); assert.equal(b.ok,true); assert.notEqual(a.id,b.id);
  assert.equal(repo.list().saves.length,2);
  first.restore(repo.load(a.id).state); first.choose('grow');
  assert.equal(repo.save(first.snapshot,a.id).id,a.id);
  assert.equal(repo.list().saves.length,2);
  assert.deepEqual(repo.load(a.id).state,first.snapshot);
  assert.deepEqual(repo.load(b.id).state,second.snapshot);
});

test('列表按保存时间排序，同时保留旧存档和坏存档，忽略其他缓存',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content); const state = model().snapshot;
  storage.setItem(repo.key,JSON.stringify(state));
  storage.setItem(`${repo.slotPrefix}older`,JSON.stringify({ savedAt:'2026-11-13T12:00:00.000Z',state }));
  storage.setItem(`${repo.slotPrefix}newer`,JSON.stringify({ savedAt:'2026-11-14T12:00:00.000Z',state }));
  storage.setItem(`${repo.slotPrefix}broken`,'{broken'); storage.setItem('outpost.language','zh-CN');
  const before = Array.from({length:storage.length},(_,index) => storage.getItem(storage.key(index)));
  const {saves,message} = repo.list();
  assert.equal(message,''); assert.equal(saves.length,4);
  assert.equal(saves[0].id,`${repo.slotPrefix}newer`); assert.equal(saves[1].id,`${repo.slotPrefix}older`);
  assert.deepEqual(saves.find(save => save.id === repo.key).state,state);
  assert.equal(saves.find(save => save.id.endsWith('broken')).state,null);
  assert.deepEqual(Array.from({length:storage.length},(_,index) => storage.getItem(storage.key(index))),before);
  const added = repo.save(state);
  assert.equal(added.ok,true); assert.equal(repo.list().saves.length,5);
  assert.equal(storage.getItem(repo.key),JSON.stringify(state));
});

test('空存档列表和不可用存储安全返回，不影响有效存档',() => {
  assert.deepEqual(new SaveRepository(memory(),content).list(),{saves:[],message:''});
  assert.equal(new SaveRepository(null,content).list().saves.length,0);
  const blocked = {getItem() { throw new Error('Storage blocked'); },setItem() { throw new Error('Quota exceeded'); }};
  const repo = new SaveRepository(blocked,content);
  assert.ok(repo.list().message); assert.equal(repo.load().state,null); assert.equal(repo.save(model().snapshot).ok,false);
});

test('删除只移除指定存档，保留其他任务和语言设置',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content);
  const a = repo.save(model().snapshot); const b = repo.save(model(['robot','shield']).snapshot);
  const retained = storage.getItem(b.id); storage.setItem('outpost.language','zh-CN');
  assert.equal(repo.delete(a.id).ok,true); assert.equal(repo.load(a.id).state,null);
  assert.deepEqual(repo.list().saves.map(save => save.id),[b.id]);
  assert.equal(storage.getItem(b.id),retained); assert.equal(storage.getItem('outpost.language'),'zh-CN');
  assert.equal(repo.delete(a.id).ok,true);
});

test('旧版存档和损坏存档均可删除，删完列表为空',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content);
  storage.setItem(repo.key,JSON.stringify(model().snapshot)); storage.setItem(`${repo.slotPrefix}broken`,'{broken');
  assert.equal(repo.delete(repo.key).ok,true); assert.equal(repo.delete(`${repo.slotPrefix}broken`).ok,true);
  assert.deepEqual(repo.list(),{saves:[],message:''});
});

test('删除拒绝非存档键，存储不可用时返回失败',() => {
  const storage = memory(); const repo = new SaveRepository(storage,content); storage.setItem('outpost.language','zh-CN');
  for (const id of [undefined,null,'outpost.language','',{},'last-light-outpost.save.v10']) assert.equal(repo.delete(id).ok,false);
  assert.equal(storage.getItem('outpost.language'),'zh-CN');
  assert.equal(new SaveRepository(null,content).delete(repo.key).ok,false);
  const blocked = { removeItem() { throw new Error('Storage blocked'); } };
  assert.equal(new SaveRepository(blocked,content).delete(repo.key).ok,false);
});

test('开关灯不扣即时电力，不改变事件、工作机会或已完成的工作',() => {
  const game = model(); const energy = game.snapshot.energy;
  for (let i=0;i<50;i++) { game.setLights(false); game.setLights(true); }
  assert.equal(game.snapshot.phase,'event'); assert.equal(game.snapshot.choiceId,null);
  assert.equal(game.snapshot.energy,energy); assert.equal(game.snapshot.daySummary.length,1);
  game.choose('plan'); game.setLights(false);
  assert.equal(game.snapshot.phase,'work'); assert.equal(game.snapshot.workId,null);
  game.work('research'); game.setLights(true); game.setLights(false);
  assert.equal(game.snapshot.phase,'end'); assert.equal(game.snapshot.workId,'research');
  assert.equal(game.snapshot.energy,energy-3); assert.throws(() => game.work('grow'));
  const repo = new SaveRepository(memory(),content); const saved = repo.save(game.snapshot);
  assert.deepEqual(repo.load(saved.id).state,game.snapshot);
});

test('持续开灯每日扣 1 E，关灯不扣，重复切换不会重复收费',() => {
  const game = model(); game.choose('grow');
  game.setLights(false); game.setLights(true); game.setLights(false); game.setLights(true);
  const on = game.snapshot; on.energy=10;
  for (let day=0;day<3;day++) finishSol(on);
  assert.equal(on.energy,7); assert.equal(on.health,100);
  const off = game.snapshot; off.lightsOn=false; off.energy=10; finishSol(off);
  assert.equal(off.energy,10); assert.equal(off.health,100);
});

test('照明电力不足时自动熄灯，库存不为负且不额外扣 health',() => {
  for (const energy of [0,1]) {
    const state = model().snapshot; Object.assign(state,{phase:'end',energy});
    finishSol(state);
    assert.equal(state.energy,0); assert.equal(state.lightsOn,false); assert.equal(state.health,100);
    assert.ok(state.previousDaySummary.includes('summary.lightsPowerLost'));
    assert.equal(state.previousDaySummary.includes('summary.lightingCost'),energy===1);
  }
  const game = model(); const state=game.snapshot; state.energy=0; state.lightsOn=false; game.restore(state);
  assert.throws(() => game.setLights(true),{message:'error.powerInsufficient'});
});

test('沙暴开关灯选项都保留工作机会，日终按最终灯光状态收费',() => {
  for (const id of ['shelter','inside']) {
    const game = model(); const state=game.snapshot;
    Object.assign(state,{sol:4,currentEventId:'sandstorm',weather:'sandstorm'}); game.restore(state);
    game.choose(id); assert.equal(game.snapshot.phase,'work'); assert.equal(game.snapshot.workId,null);
    game.work('research'); const energy=game.snapshot.energy;
    const end=game.snapshot; finishSol(end);
    assert.equal(end.energy,energy-(id==='inside' ? 1 : 0));
  }
});

test('读档不重复结算照明，结束当天才扣费，任务结束后不可切灯',() => {
  const game=model(); game.choose('grow'); const repo=new SaveRepository(memory(),content);
  const saved=repo.save(game.snapshot); const restored=new GameModel(content); restored.restore(repo.load(saved.id).state);
  assert.equal(restored.snapshot.energy,game.snapshot.energy);
  restored.nextSol(); assert.equal(restored.snapshot.energy,game.snapshot.energy-1+6-3);
  assert.equal(restored.snapshot.previousDaySummary.filter(key => key==='summary.lightingCost').length,1);
  const finished=restored.snapshot; Object.assign(finished,{phase:'finished',outcome:'success'}); restored.restore(finished);
  assert.throws(() => restored.setLights(false),{message:'error.lightsUnavailable'});
});
