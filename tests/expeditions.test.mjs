import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { choiceReason } from '../src/models/DailyEventRules.js';
import { crewAway, crewFatigued, researchUses, expeditionReason } from '../src/models/ExpeditionRules.js';
import { sceneState } from '../src/views/SceneState.js';
import { validVisualAction } from '../src/models/VisualAction.js';

const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const content={events:(await read('events')).filter(e=>!e.dailySol),tools:await read('tools')};
function game(tools=['robot','battery'],environment={}) { const model=new GameModel({...content,environment});model.start(tools);return model; }
function respond(model) {
  if(model.snapshot.phase!=='event')return;
  const choice=model.events.get(model.snapshot.currentEventId).choices.find(c=>!c.work&&!choiceReason(model.snapshot,c));
  assert.ok(choice);model.choose(choice.id);
}
function day(model,work='standby') { respond(model);if(model.snapshot.phase==='work')model.work(work);model.nextSol(); }
function repository() {const data=new Map();return new SaveRepository({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},content);}
function returned() {const model=game();model.planExpedition('astronaut-a');day(model);day(model);return model;}

test('day-one plans are free and editable; departure, return and saved absence follow Sol boundaries',()=>{
  const model=game(),before=model.snapshot;
  assert.deepEqual(before.samples,[]);
  model.planExpedition('astronaut-b');model.planExpedition(null);model.planExpedition('astronaut-a');
  assert.equal(model.snapshot.workId,null);assert.equal(model.snapshot.energy,before.energy);assert.equal(model.snapshot.phase,'event');
  assert.equal(crewAway(model.snapshot,'astronaut-a'),false);day(model);
  assert.equal(model.snapshot.sol,2);assert.ok(crewAway(model.snapshot,'astronaut-a'));assert.equal(sceneState(model.snapshot).crewA,'away');assert.equal(sceneState(model.snapshot).crewB,'seated');
  const repo=repository(),saved=repo.save(model.snapshot),restored=game();restored.restore(repo.load(saved.id).state);
  assert.deepEqual(restored.snapshot,model.snapshot);day(restored);
  assert.equal(restored.snapshot.sol,3);assert.equal(crewAway(restored.snapshot,'astronaut-a'),false);assert.deepEqual(restored.snapshot.samples,[1]);assert.equal(restored.snapshot.crew['astronaut-a'].fatigue,4);assert.equal(restored.snapshot.expeditionPlan,null);
  const returnedSave=repo.save(restored.snapshot);restored.restore(repo.load(returnedSave.id).state);assert.deepEqual(restored.snapshot.samples,[1]);
  respond(restored);restored.work('research');assert.equal(restored.snapshot.visualAction.actorId,'astronaut-b');assert.ok(validVisualAction(restored.snapshot.visualAction));assert.deepEqual(restored.snapshot.samples,[]);
});

test('robot collection supplies a real sample once per Sol, independently of event and daily work',()=>{
  const model=game(),before=model.snapshot;model.collectWithRobot();
  assert.equal(model.snapshot.energy,before.energy-4);assert.equal(model.snapshot.localData,0);assert.equal(model.snapshot.workId,null);assert.equal(model.snapshot.choiceId,null);
  assert.deepEqual(model.snapshot.samples,[1]);assert.equal(researchUses(model.snapshot),1);
  const collected=model.snapshot;assert.throws(()=>model.collectWithRobot(),{message:'error.robotAlreadyCollected'});assert.deepEqual(model.snapshot,collected);
  respond(model);model.work('research');assert.equal(model.snapshot.localData,20);assert.deepEqual(model.snapshot.samples,[]);assert.equal(sceneState(model.snapshot).samples,'0');
  model.nextSol();model.useBattery();model.collectWithRobot();respond(model);model.work('research');assert.equal(model.snapshot.localData,40);assert.deepEqual(model.snapshot.samples,[]);assert.equal(sceneState(model.snapshot).samples,'0');
  model.nextSol();respond(model);assert.throws(()=>model.work('research'),{message:'error.noSamples'});
});

test('collection caps at three samples, rejects unaffordable or missing robots, and never charges on rejection',()=>{
  const model=game(),state=model.snapshot;state.samples=[1,2];model.restore(state);model.collectWithRobot();assert.deepEqual(model.snapshot.samples,[1,2,1]);assert.equal(researchUses(model.snapshot),3);
  day(model);const full=model.snapshot;assert.throws(()=>model.collectWithRobot(),{message:'error.samplesFull'});assert.throws(()=>model.planExpedition('astronaut-a'),{message:'error.samplesFull'});assert.deepEqual(model.snapshot,full);
  const missing=game(['toolkit','battery']);assert.throws(()=>missing.collectWithRobot(),{message:'error.toolUnavailable'});
  const low=game(),s=low.snapshot;s.energy=3;low.restore(s);assert.throws(()=>low.collectWithRobot(),{message:'error.powerInsufficient'});assert.deepEqual(low.snapshot,s);
});

test('fatigue recovers automatically over two lit days or four unlit days, with mixed days accumulating',()=>{
  for(const lights of [[true,true],[false,false,false,false],[false,true,false]]) {
    const model=returned();let fatigue=4;
    for(const on of lights) {
      assert.ok(crewFatigued(model.snapshot,'astronaut-a'));
      assert.throws(()=>model.planExpedition('astronaut-a'),{message:'error.crewFatigued'});
      if(model.snapshot.lightsOn!==on)model.setLights(on);
      day(model);fatigue=Math.max(0,fatigue-(on?2:1));assert.equal(model.snapshot.crew['astronaut-a'].fatigue,fatigue);
      const repo=repository(),saved=repo.save(model.snapshot);model.restore(repo.load(saved.id).state);assert.equal(model.snapshot.crew['astronaut-a'].fatigue,fatigue);
    }
    assert.equal(crewFatigued(model.snapshot,'astronaut-a'),false);assert.equal(expeditionReason(model.snapshot,'astronaut-a'),'');
  }
});

test('zero-power lights cannot grant lit recovery, and away crew cannot recover or be scheduled again',()=>{
  const model=returned(),state=model.snapshot;Object.assign(state,{energy:0,lifeSupportPaid:true});model.restore(state);day(model);assert.equal(model.snapshot.crew['astronaut-a'].fatigue,3);
  const away=game();away.planExpedition('astronaut-b');day(away);assert.throws(()=>away.planExpedition('astronaut-b'),{message:'error.crewAway'});
});

test('when both crew are recovering, robot sampling and rest remain available without assigning ordinary work to them',()=>{
  const model=game(),state=model.snapshot;
  state.crew['astronaut-a'].fatigue=4;state.crew['astronaut-b'].fatigue=4;state.health=80;model.restore(state);
  model.collectWithRobot();respond(model);
  assert.throws(()=>model.work('research'),{message:'error.crewResting'});
  model.work('rest');model.nextSol();
  assert.equal(model.snapshot.health,88);assert.equal(model.snapshot.crew['astronaut-a'].fatigue,2);assert.equal(model.snapshot.crew['astronaut-b'].fatigue,2);
});

test('departure storms extend crew travel but block robot work; capacity filled in transit never overflows on return',()=>{
  const storm=game(['robot','battery'],{days:{2:'sandstorm'}});storm.planExpedition('astronaut-a');day(storm);
  assert.equal(crewAway(storm.snapshot,'astronaut-a'),true);assert.equal(storm.snapshot.expeditionPlan,null);assert.equal(storm.snapshot.crew['astronaut-a'].returnSol,4);assert.throws(()=>storm.collectWithRobot(),{message:'error.stormOutside'});
  const model=game();model.planExpedition('astronaut-b');day(model);const state=model.snapshot;state.samples=[2,2,2];model.restore(state);day(model);assert.equal(model.snapshot.samples.length,3);assert.ok(crewFatigued(model.snapshot,'astronaut-b'));assert.ok(model.snapshot.daySummary.includes('expedition.storageFull'));
});

test('v3 migration keeps resources without inventing samples; malformed new crew inventories are rejected',()=>{
  const repo=repository(),model=game(),legacy=model.snapshot;legacy.version=3;legacy.food=20;legacy.dailySystems.harvestFood=8;legacy.localData=24;
  for(const key of ['samples','crew','expeditionPlan','robotSampleSol'])delete legacy[key];
  const saved=repo.save(legacy),loaded=repo.load(saved.id).state;assert.equal(loaded.version,5);assert.equal(loaded.localData,24);assert.deepEqual(loaded.samples,[]);
  for(const update of [{samples:[2,2,2,2]},{samples:[0]},{robotSampleSol:2},{crew:{}},{expeditionPlan:{crewId:'stranger',departSol:2}}]) {const invalid=repo.save({...model.snapshot,...update});assert.equal(repo.load(invalid.id).state,null);}
  const late=model.snapshot;late.sol=13;model.restore(late);assert.throws(()=>model.planExpedition('astronaut-a'),{message:'error.expeditionTooLate'});
});
