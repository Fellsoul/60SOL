import { ACTIONS, unavailableReason } from '../src/models/ActionRules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { choiceReason } from '../src/models/DailyEventRules.js';
import { concurrentEvent, eventPressure, beginConcurrentEvents, syncFatigueEvents } from '../src/models/ConcurrentEvents.js';

const events=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools=JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
function dailyGame() { const model=new GameModel({events,tools}); model.start(['toolkit','battery']); model.setLights(false); return model; }
function storage() { const items=new Map(); return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)}; }
function settleExtras(game) {
  for (const instance of game.snapshot.concurrentEvents ?? []) {
    if (instance.choiceId) continue;
    const event = concurrentEvent(instance,game.events);
    const choice = event.choices.find(item => item.energy === 0 && item.work === false && !choiceReason(game.snapshot,item));
    assert.ok(choice);
    game.chooseConcurrent(instance.id,choice.id);
  }
}

test('all fourteen Sols have a playable daily event, resolved before next Sol',() => {
  const game=dailyGame(); const seen=[];
  for(let sol=1;sol<=14;sol++) {
    assert.equal(game.snapshot.sol,sol); assert.equal(game.snapshot.phase,'event');
    const event=game.events.get(game.snapshot.currentEventId); seen.push(event.id);
    assert.ok(event.dailySol); assert.ok(event.choices.length>=2);
    const pending=game.snapshot;
    assert.throws(()=>game.nextSol(),{message:'error.eventUnresolved'}); assert.deepEqual(game.snapshot,pending);
    assert.equal(unavailableReason(game.snapshot,ACTIONS.find(action=>action.id==='standby'),event),event.blockedWork?.includes('standby') ? event.blockReason : '');
    const choice=event.choices.find(choice=>choice.energy===0&&!choiceReason(game.snapshot,choice));
    assert.ok(choice,'Every daily case needs an affordable zero-energy fallback');
    game.choose(choice.id); assert.equal(game.snapshot.eventDone,true);
    assert.throws(()=>game.choose(choice.id));
    if(game.snapshot.phase==='work') game.work('standby');
    settleExtras(game); game.nextSol();
  }
  assert.equal(seen.length,14); assert.equal(game.snapshot.phase,'finished'); assert.equal(game.snapshot.outcome,'incomplete');
});

test('reload keeps pending event locked; closing panels, battery, lights and forged end phase cannot bypass it',() => {
  const game=dailyGame(); const memory=storage(); const repo=new SaveRepository(memory,{events,tools});
  game.useBattery(); game.setLights(true); game.setLights(false);
  const saved=repo.save(game.snapshot); assert.equal(saved.ok,true);
  const loaded=repo.load(saved.id); assert.ok(loaded.state);
  const restored=new GameModel({events,tools});restored.restore(loaded.state);
  assert.equal(restored.snapshot.currentEventId,'E01'); assert.equal(restored.snapshot.eventDone,false);
  assert.throws(()=>restored.nextSol(),{message:'error.eventUnresolved'});
  const forged=restored.snapshot;forged.phase='end';restored.restore(forged);
  assert.throws(()=>restored.nextSol(),{message:'error.eventUnresolved'});
});

test('resolved choices and costs survive reload without being applied twice',() => {
  const game=dailyGame(); game.choose('secure');
  assert.equal(game.snapshot.dailySystems.spares,3);
  const memory=storage();const repo=new SaveRepository(memory,{events,tools});const saved=repo.save(game.snapshot);
  const restored=new GameModel({events,tools});restored.restore(repo.load(saved.id).state);
  assert.deepEqual(restored.snapshot,game.snapshot);assert.throws(()=>restored.choose('secure'));
  restored.nextSol(); assert.equal(restored.snapshot.sol,2); assert.equal(restored.snapshot.currentEventId,'E20');
  assert.equal(restored.snapshot.eventDone,false); assert.equal(restored.snapshot.dailySystems.spares,3);
});

test('manual-care, panel and laboratory restrictions affect actual normal work and mornings',() => {
  const game=dailyGame(); const state=game.snapshot;
  Object.assign(state,{sol:3,currentEventId:'E04'});game.restore(state);game.choose('manual');
  const before=game.snapshot.energy;game.work('grow');assert.equal(game.snapshot.energy,before-4);
  game.nextSol();assert.equal(game.snapshot.currentEventId,'E07');game.choose('close');
  assert.throws(()=>game.work('research'),{message:'error.facilityUnavailable'});
  game.work('standby');game.nextSol();
  const panel=game.snapshot;Object.assign(panel,{sol:8,currentEventId:'E02',phase:'event',choiceId:null,workId:null,eventDone:false});game.restore(panel);
  game.choose('lock');game.work('standby');game.nextSol();assert.equal(game.snapshot.generation,4);
});

test('scheduled crop and final-day cases are replaced when prerequisites are missing',() => {
  const game=dailyGame();const state=game.snapshot;
  Object.assign(state,{sol:11,phase:'end',choiceId:'minimum',currentEventId:'E19',eventDone:true,growth:0,food:30});game.restore(state);
  game.nextSol();assert.notEqual(game.snapshot.currentEventId,'E11');assert.ok(game.events.get(game.snapshot.currentEventId).dailySol);
  const last=game.snapshot;Object.assign(last,{sol:13,phase:'end',currentEventId:'E09',choiceId:'isolate',eventDone:true,localData:0});game.restore(last);
  settleExtras(game);game.nextSol();assert.notEqual(game.snapshot.currentEventId,'E16');assert.equal(game.snapshot.phase,'event');
});

test('final daily response sends existing research once before mission evaluation',() => {
  const game=dailyGame();const state=game.snapshot;
  Object.assign(state,{sol:14,currentEventId:'E16',localData:30,sentData:30,food:2});game.restore(state);
  game.choose('borrow');assert.equal(game.snapshot.pendingData,30);assert.equal(game.snapshot.localData,0);
  assert.equal(game.snapshot.dailySystems.greenhouseDisabled,true);
  game.nextSol();assert.equal(game.snapshot.sentData,60);assert.equal(game.snapshot.outcome,'success');
});

test('a full daily-event mission can reach the 60-data objective safely',() => {
  const game=new GameModel({events,tools,environment:{default:'clear',days:{4:'sandstorm',8:'sandstorm',9:'sandstorm'}}});
  game.start(['toolkit','battery']);game.setLights(false);
  const route=[['secure',null],['inspect_clean',null],['manual','research'],['close','transmit'],['forgo','clean'],['replace',null],['restore',null],['lock','research'],['standby','research'],['isolate','repair'],['minimum',null],['forgo','research'],['isolate','transmit'],['borrow',null]];
  for(let index=0;index<route.length;index++) {
    assert.equal(game.snapshot.sol,index+1);
    if(index===6)game.useBattery();
    const [response,work]=route[index];game.choose(response);
    if(work)game.work(work);
    if([0,10].includes(index))game.planExpedition('astronaut-a');
    if(index===4)game.planExpedition('astronaut-b');
    settleExtras(game);game.nextSol();
  }
  assert.equal(game.snapshot.outcome,'success');assert.equal(game.snapshot.sentData,60);assert.ok(game.snapshot.health>0);
});

test('fatigue events exceed random slots and stay attached to each tired astronaut',() => {
  const game=dailyGame();const state=game.snapshot;
  state.concurrentEvents=Array.from({length:4},(_,i)=>({id:`extra${i}`,eventId:'E01',choiceId:'secure'}));
  for(const crew of Object.values(state.crew))crew.fatigue=4;
  syncFatigueEvents(state,game.events);syncFatigueEvents(state,game.events);
  assert.equal(state.concurrentEvents.length,6);
  assert.equal(state.concurrentEvents.filter(item=>item.crewId).length,2);
  game.restore(state);game.choose('secure');
  const energy=game.snapshot.energy;
  assert.throws(()=>game.nextSol(),{message:'error.eventUnresolved'});
  settleExtras(game);
  assert.equal(game.snapshot.energy,energy);
  assert.equal(game.snapshot.crew['astronaut-a'].fatigue,4);
  assert.throws(()=>game.chooseConcurrent('fatigue:astronaut-a','recover'));
  const repo=new SaveRepository(storage(),{events,tools});const saved=repo.save(game.snapshot);
  assert.ok(repo.load(saved.id).state);
  game.nextSol();assert.equal(game.snapshot.sol,2);
});

test('event pressure accelerates nonlinearly and seeded concurrent draws survive reload',() => {
  assert.ok(eventPressure(14).slots>eventPressure(7).slots);
  assert.ok(eventPressure(14).chance-eventPressure(7).chance>eventPressure(7).chance-eventPressure(1).chance);
  const game=dailyGame();const state=game.snapshot;
  state.sol=14;state.currentEventId='E16';state.rng=123;state.history={};
  const copy=structuredClone(state);
  beginConcurrentEvents(state,game.events);beginConcurrentEvents(copy,game.events);
  assert.deepEqual(state.concurrentEvents,copy.concurrentEvents);assert.equal(state.rng,copy.rng);
  assert.ok(state.concurrentEvents.length>0);
  assert.ok(state.concurrentEvents.every(instance=>instance.eventId!=='E16'));
  game.restore(state);const saved=game.snapshot;game.restore(saved);assert.deepEqual(game.snapshot,saved);
});
