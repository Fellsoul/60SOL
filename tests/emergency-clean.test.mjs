import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { emergencyCleanAvailable } from '../src/models/DailyEventRules.js';

const events=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools=JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
function game(overrides={}) {
  const model=new GameModel({events,tools});model.start(['toolkit','battery']);
  model.restore({...model.snapshot,sol:4,currentEventId:'E07',weather:'sandstorm',dusty:true,energy:0,health:90,...overrides});
  return model;
}

test('storm OR insufficient power offers emergency cleaning only when panels need cleaning',()=>{
  for(const [weather,energy,wanted] of [['sandstorm',5,true],['clear',0,true],['clear',1,true],['clear',2,false]]) {
    assert.equal(emergencyCleanAvailable(game({weather,energy}).snapshot),wanted);
  }
  assert.equal(emergencyCleanAvailable(game({weather:'clear',dusty:false}).snapshot),false);
  const capped=game({weather:'clear',dusty:false}).snapshot;capped.dailySystems.generationCap=4;
  assert.equal(emergencyCleanAvailable(capped),true);
});

test('forced cleaning costs 20 health and one work slot, no energy, without skipping the daily event',()=>{
  const model=game();const before=model.snapshot;
  model.chooseEmergencyClean('force_clean');const after=model.snapshot;
  assert.equal(after.energy,0);assert.equal(after.health,70);assert.equal(after.dusty,false);
  assert.equal(after.dailySystems.generationCap,6);assert.equal(after.generation,before.generation);
  assert.equal(after.workId,'event:force_clean');assert.equal(after.currentEventId,'E07');assert.equal(after.eventDone,false);
  assert.throws(()=>model.nextSol(),{message:'error.eventUnresolved'});model.work('standby');assert.throws(()=>model.work('standby'));
  model.choose('close');assert.equal(model.snapshot.phase,'end');
  assert.throws(()=>model.chooseEmergencyClean('force_clean'));assert.equal(model.snapshot.health,70);
});

test('declining and insufficient health/work have no unexpected resource or mission changes',()=>{
  const model=game();const before=model.snapshot;model.chooseEmergencyClean('stay_inside');
  for(const key of ['energy','health','dusty','workId','choiceId','phase']) assert.equal(model.snapshot[key],before[key]);
  assert.throws(()=>model.chooseEmergencyClean('force_clean'));
  for(const override of [{health:20},{health:1},{workId:'standby',workIds:['standby','standby']},{phase:'finished',outcome:'unsafe'},{currentEventId:'E19'}]) {
    const locked=game(override);const snapshot=locked.snapshot;
    assert.throws(()=>locked.chooseEmergencyClean('force_clean'));assert.deepEqual(locked.snapshot,snapshot);
  }
});

test('saving and reloading preserves the health cost and prevents duplicate emergency responses',()=>{
  const model=game();model.chooseEmergencyClean('force_clean');let raw;
  const repo=new SaveRepository({getItem:()=>raw,setItem:(_,value)=>{raw=value;}},{events,tools});
  const saved=repo.save(model.snapshot);assert.equal(saved.ok,true);
  const restored=game();restored.restore(repo.load(saved.id).state);assert.deepEqual(restored.snapshot,model.snapshot);
  assert.throws(()=>restored.chooseEmergencyClean('force_clean'));assert.equal(restored.snapshot.health,70);
});

test('cleaning helps next clear morning but a subsequent storm can coat the panels again',()=>{
  for(const [weather,generation] of [['clear',8],['sandstorm',4]]) {
    const model=new GameModel({events,tools,environment:{default:weather}});
    model.restore(game().snapshot);model.chooseEmergencyClean('force_clean');model.choose('close');model.nextSol();
    assert.equal(model.snapshot.generation,generation);assert.equal(model.snapshot.dusty,weather==='sandstorm');
  }
});
