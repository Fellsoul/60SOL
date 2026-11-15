import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const content={events:await read('events'),tools:await read('tools')};
function game(id) {
  const model=new GameModel(content);model.start(['robot','battery']);
  const state=model.snapshot;Object.assign(state,{currentEventId:id,energy:0,health:90,weather:'sandstorm',concurrentEvents:[]});
  Object.assign(state.dailySystems,{trackingCap:4,careCost:4,labUntil:15,harvestFood:24});model.restore(state);return model;
}

test('four toolkit events offer manual repairs with matching effects, health cost, supplies and persisted logs',()=>{
  for (const id of ['E02','E04','E07','E09']) {
    const model=game(id);const event=model.events.get(id);
    model.choose('force_repair');const state=model.snapshot;
    assert.equal(state.health,70);assert.equal(state.energy,0);assert.equal(state.workId,'event:force_repair');
    assert.equal(state.dailySystems.spares,['E02','E07'].includes(id)?1:2);
    for(const effect of event.choices.find(c=>c.tool==='toolkit').dailyEffects)assert.equal(state.dailySystems[effect.key],effect.value);
    assert.ok(state.daySummary.includes(`event.${id}.daily.force_repair.summaryLine`));
    assert.equal(state.resourceLog.at(-1).changes.health,-20);
    assert.equal(state.visualAction.cost.condition,20);
    let raw;const repo=new SaveRepository({getItem:()=>raw,setItem:(_,value)=>{raw=value;}},content);
    const saved=repo.save(state);model.restore(repo.load(saved.id).state);
    assert.deepEqual(model.snapshot,state);assert.throws(()=>model.choose('force_repair'));
  }
});

test('manual event repairs reject insufficient health, used work, and missing required spares without charging',()=>{
  for(const id of ['E02','E04','E07','E09'])for(const override of [{health:20},{workId:'standby',workIds:['standby','standby']}]){
    const model=game(id);model.restore({...model.snapshot,...override});const before=model.snapshot;
    assert.throws(()=>model.choose('force_repair'));assert.deepEqual(model.snapshot,before);
  }
  for(const id of ['E02','E07']){
    const model=game(id);const state=model.snapshot;state.dailySystems.spares=0;model.restore(state);
    assert.throws(()=>model.choose('force_repair'));assert.deepEqual(model.snapshot,state);
  }
});

test('daily manual panel repair works without tools or power in storms, restores panels, and uses one work slot',()=>{
  const model=game('routine');model.choose('continue');
  model.work('force_repair');const state=model.snapshot;
  assert.equal(state.health,70);assert.equal(state.energy,0);assert.equal(state.dusty,false);
  assert.equal(state.dailySystems.generationCap,6);assert.equal(state.dailySystems.trackingCap,6);
  assert.equal(state.visualAction.station,'exterior');assert.equal(state.visualAction.cost.condition,20);
  assert.throws(()=>model.work('force_repair'));assert.equal(model.snapshot.health,70);
  const shelter=game('E19');assert.throws(()=>shelter.work('force_repair'));
  const weak=game('routine');weak.choose('continue');weak.restore({...weak.snapshot,health:20});
  assert.throws(()=>weak.work('force_repair'),{message:'error.conditionInsufficient'});
});
