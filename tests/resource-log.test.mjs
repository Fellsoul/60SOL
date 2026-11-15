import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { finishSol } from '../src/models/TurnEngine.js';
import { resourceSnapshot } from '../src/models/ResourceLog.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { choiceReason } from '../src/models/DailyEventRules.js';
import { beginSol } from '../src/models/TurnEngine.js';
import { TerminalView } from '../src/views/TerminalView.js';
import { i18n } from '../src/services/I18n.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const content = {events:await read('events'),tools:await read('tools'),resource_log:await read('resource_log')};
function game() { const model = new GameModel(content); model.start(['toolkit','battery']); return model; }
const catalogs=Object.fromEntries(await Promise.all(['en','zh-CN'].map(async lang=>[lang,JSON.parse(await readFile(new URL(`../locales/${lang}.json`,import.meta.url),'utf8'))])));
i18n.setCatalogs(catalogs);
const summary=entries=>TerminalView.prototype.resourceSummary.call({resourceLog:content.resource_log,copy:TerminalView.prototype.copy},entries);
test('morning records actual capped charging and the full life-support cost',() => {
  const model = game();
  assert.equal(model.snapshot.resourceLog.find(entry => entry.source === 'generation').changes.energy,2);
  assert.equal(model.snapshot.resourceLog.find(entry => entry.source === 'lifeSupport').changes.energy,-3);
  assert.equal(model.snapshot.resourceLog.find(entry => entry.source === 'generation').generated,8);
});
test('power summaries distinguish gross generation from capped charging and use one battery per quantity',()=>{
  const model=game(),entries=model.snapshot.resourceLog;
  const html=summary(entries.filter(entry=>entry.source==='generation'));
  assert.ok(html.includes('Generated +8'));assert.ok(html.includes('Stored +2'));
  assert.ok(html.includes('× 8'));assert.ok(html.includes('× 2'));
  assert.equal((html.match(/assets\/ui\/battery.png/g)??[]).length,2);
  const support=summary(entries.filter(entry=>entry.source==='lifeSupport'));
  assert.ok(support.includes('× 3'));assert.equal((support.match(/assets\/ui\/battery.png/g)??[]).length,1);
  const full=model.snapshot;full.energy=12;full.generation=8;
  beginSol(full,model.events,{},content.resource_log);
  const generation=full.resourceLog.find(entry=>entry.source==='generation');
  assert.equal(generation.generated,8);assert.equal(generation.changes.energy,undefined);
  assert.ok(summary([generation]).includes('Stored +0'));
  const legacy=summary([{source:'generation',variant:0,fallback:'',changes:{energy:2,generation:3}}]);
  assert.ok(legacy.includes('Stored +2'));assert.ok(!legacy.includes('Generated'));
});
test('every available event response records exactly its numeric effects',() => {
  let checked=0;
  for (const event of content.events) for (const choice of event.choices) {
    const model=game(),state=model.snapshot;
    Object.assign(state,{currentEventId:event.id,sol:5,phase:'event',energy:12,food:20,health:90,localData:20,growth:1,weather:'clear',resourceLog:[]});
    model.restore(state);
    const before=resourceSnapshot(state);
    if (choiceReason(state,choice)) continue;
    model.choose(choice.id);
    const after=resourceSnapshot(model.snapshot);
    const expected=Object.fromEntries(Object.entries(after).map(([key,value])=>[key,value-before[key]]).filter(([,value])=>value));
    const logs=model.snapshot.resourceLog;
    assert.deepEqual(logs[0]?.changes ?? {},expected,`${event.id}/${choice.id}`);
    if(logs.length) assert.equal(logs[0].fallback,choice.summaryLine);
    checked++;
  }
  assert.ok(checked>40);
});
test('harvest, backup battery and day-end costs keep their actual capped values',() => {
  const model=game(),state=model.snapshot;
  Object.assign(state,{currentEventId:'arrival',phase:'work',choiceId:'plan',eventDone:true,growth:2,food:126,health:100});
  model.restore(state); model.work('grow'); model.useBattery();
  assert.equal(model.snapshot.resourceLog.find(entry=>entry.source==='work.grow').changes.food,2);
  assert.equal(model.snapshot.resourceLog.find(entry=>entry.source==='battery').changes.energy,6);
  model.nextSol();
  const log=model.snapshot.previousResourceLog;
  assert.equal(log.find(entry=>entry.source==='meals').changes.food,-8);
  assert.equal(log.find(entry=>entry.source==='lighting').changes.energy,-1);
  assert.notDeepEqual(model.snapshot.resourceLog,log);
});
test('shortages and transmission confirmation log real deltas without double counting',() => {
  const state=game().snapshot;
  Object.assign(state,{food:1,health:20,lifeSupportPaid:false,pendingData:7,resourceLog:[],lightsOn:false});
  finishSol(state,content.resource_log);
  assert.equal(state.previousResourceLog.find(entry=>entry.source==='meals').changes.food,-1);
  assert.equal(state.previousResourceLog.find(entry=>entry.source==='hunger').changes.health,-12);
  assert.equal(state.previousResourceLog.find(entry=>entry.source==='supportDamage').changes.health,-8);
  assert.deepEqual(state.previousResourceLog.find(entry=>entry.source==='transmissionConfirmed').changes,{pendingData:-7,sentData:7});
});
test('descriptions are bilingual; selected variants survive saving and leave event RNG alone',() => {
  for(const source of Object.values(content.resource_log.sources)) {
    assert.equal(source.descriptions.en.length,source.descriptions['zh-CN'].length);
    assert.ok(source.descriptions.en.length);
  }
  const model=game(),before=model.snapshot;
  model.useBattery();assert.equal(model.snapshot.rng,before.rng);
  const records=new Map();
  const repo=new SaveRepository({getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)},content);
  const saved=repo.save(model.snapshot);
  assert.deepEqual(repo.load(saved.id).state,model.snapshot);
});

test('emergency cleaning records health loss once and keeps it in the saved resource history',() => {
  const model=game(),state=model.snapshot;
  Object.assign(state,{sol:4,currentEventId:'E07',weather:'sandstorm',dusty:true,health:90,energy:0,resourceLog:[]});
  model.restore(state);model.chooseEmergencyClean('force_clean');
  const entries=model.snapshot.resourceLog;
  assert.equal(entries.length,1);
  assert.equal(entries[0].source,'event.emergency_clean.force_clean');
  assert.deepEqual(entries[0].changes,{health:-20});
  assert.equal(entries[0].fallback,'event.emergency_clean.choice.force_clean.summaryLine');
  assert.throws(()=>model.chooseEmergencyClean('force_clean'));
  assert.deepEqual(model.snapshot.resourceLog,entries);
  model.choose('close');model.nextSol();
  assert.deepEqual(model.snapshot.previousResourceLog.find(entry=>entry.source==='event.emergency_clean.force_clean'),entries[0]);
});
