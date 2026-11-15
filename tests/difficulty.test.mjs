import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { choiceEnergy, choiceReason, applyDailyChoice } from '../src/models/DailyEventRules.js';
import { beginSol } from '../src/models/TurnEngine.js';
import { clipboardTasks } from '../src/views/TaskView.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const content = {events:await read('events'),tools:await read('tools')};
function game(difficulty) { const model=new GameModel(content);model.start(['toolkit','battery'],null,difficulty);return model; }

test('each difficulty generates approved power, pays support, and respects battery capacity',()=>{
  for (const [difficulty,generation,support,dust] of [['easy',9,2,4],['medium',8,3,4],['hard',6,3,3]]) {
    const model=game(difficulty),state=model.snapshot;
    assert.equal(state.generation,generation);assert.equal(state.energy,12-support);
    assert.equal(state.resourceLog.find(x=>x.source==='lifeSupport').changes.energy,-support);
    state.energy=0;beginSol(state,model.events);
    assert.equal(state.energy,generation-support);
    state.energy=0;beginSol(state,model.events,{default:'sandstorm'});
    assert.equal(state.generation,dust);assert.equal(state.energy,Math.max(0,dust-support));
    assert.equal(state.lifeSupportPaid,dust>=support);
    state.dailySystems.generationCap=0;beginSol(state,model.events);
    assert.equal(state.generation,0);
  }
});

test('event badges, affordability and primary/concurrent settlement agree at each difficulty',()=>{
  for (const [difficulty,cost] of [['easy',2],['medium',3],['hard',4]]) {
    const model=game(difficulty),event=model.events.get('E02');
    const choice=event.choices.find(x=>x.id==='repair');
    const state=model.snapshot;
    Object.assign(state,{currentEventId:event.id,energy:cost,phase:'event',choiceId:null,eventDone:false,workId:null,resourceLog:[]});
    assert.equal(choiceEnergy(state,choice),cost);assert.equal(choiceReason(state,choice),'');
    assert.equal(clipboardTasks(state,event).find(x=>x.id===choice.id).energy,cost);
    assert.equal(choiceReason({...state,energy:cost-1},choice),'error.powerInsufficient');
    model.restore(state);model.choose(choice.id);assert.equal(model.snapshot.energy,0);
    assert.equal(model.snapshot.resourceLog[0].changes.energy,-cost);
    state.concurrentEvents=[{id:'secondary',eventId:event.id,choiceId:null}];
    state.currentEventId='arrival';model.restore(state);
    model.chooseConcurrent('secondary',choice.id);assert.equal(model.snapshot.energy,0);
    assert.equal(choiceEnergy(state,{energy:0}),0);
    assert.equal(choiceEnergy(state,{energy:1}),difficulty==='easy'?0:difficulty==='hard'?2:1);
  }
});

test('energy rewards and losses apply modifiers without negative values or overflowing batteries',()=>{
  for (const [difficulty,gain,cost] of [['easy',4,2],['medium',3,3],['hard',2,4]]) {
    const state=game(difficulty).snapshot;state.energy=5;
    applyDailyChoice(state,{dailyEffects:[{op:'add',resource:'energy',amount:3}]});
    assert.equal(state.energy,5+gain);
    applyDailyChoice(state,{dailyEffects:[{op:'add',resource:'energy',amount:-3}]});
    assert.equal(state.energy,5+gain-cost);
    state.energy=11;applyDailyChoice(state,{dailyEffects:[{op:'add',resource:'energy',amount:9}]});
    assert.equal(state.energy,12);
    state.energy=0;applyDailyChoice(state,{dailyEffects:[{op:'add',resource:'energy',amount:-1}]});
    assert.equal(state.energy,0);
    applyDailyChoice(state,{dailyEffects:[{op:'add',resource:'energy',amount:0}]});assert.equal(state.energy,0);
    applyDailyChoice(state,{dailyEffects:[{op:'add',resource:'energy',amount:1}]});
    assert.equal(state.energy,difficulty==='easy'?2:difficulty==='hard'?0:1);
  }
});

test('difficulty and up-to-nine generation survive saves; legacy saves default to medium',()=>{
  let raw;const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const repo=new SaveRepository(storage,content);
  for (const difficulty of ['easy','medium','hard']) {
    const model=game(difficulty);const saved=repo.save(model.snapshot);assert.equal(saved.ok,true);
    const restored=new GameModel(content);restored.restore(repo.load(saved.id).state);
    assert.deepEqual(restored.snapshot,model.snapshot);
    const state=restored.snapshot;state.energy=0;beginSol(state,restored.events);
    assert.equal(state.generation,model.snapshot.generation);
  }
  const legacy=game('medium').snapshot;delete legacy.difficulty;
  const saved=repo.save(legacy);assert.equal(saved.ok,true);
  const restored=new GameModel(content);restored.restore(repo.load(saved.id).state);
  assert.equal(restored.snapshot.difficulty,'medium');
  const invalid=repo.save({...legacy,difficulty:'invalid'});
  assert.equal(repo.load(invalid.id).state,null);
  assert.throws(()=>game('invalid'));
});
