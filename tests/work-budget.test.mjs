import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { workLimit, workRemaining, workHistory } from '../src/models/WorkBudget.js';
import { clipboardTasks } from '../src/views/TaskView.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url),'utf8'));
const content={events:(await read('events')).filter(e=>!e.dailySol),tools:await read('tools')};
function game(){const m=new GameModel(content);m.start(['robot','battery']);return m;}
function repo(){let raw;return new SaveRepository({getItem:()=>raw,setItem:(_,v)=>{raw=v;}},content);}

test('two rested conscious crew at base allow two assignments, each charged once, including repeated work',()=>{
 const m=game();m.choose('plan');const before=m.snapshot;
 assert.equal(workLimit(before),2);m.work('grow');const first=m.snapshot.visualAction;
 assert.equal(workRemaining(m.snapshot),1);m.work('grow');
 assert.equal(m.snapshot.energy,before.energy-6);assert.equal(m.snapshot.growth,2);
 assert.deepEqual(workHistory(m.snapshot),['grow','grow']);assert.equal(workRemaining(m.snapshot),0);
 assert.notEqual(m.snapshot.visualAction.id,first.id);assert.notEqual(m.snapshot.visualAction.actorId,first.actorId);
 const done=m.snapshot;assert.throws(()=>m.work('standby'),{message:'error.workUsed'});assert.deepEqual(m.snapshot,done);
 assert.ok(clipboardTasks(done,m.events.get(done.currentEventId)).filter(r=>r.command==='work').every(r=>r.reason==='error.workUsed'));
 m.nextSol();assert.equal(workRemaining(m.snapshot),2);assert.deepEqual(m.snapshot.workIds,[]);
});

test('fatigued, unconscious or away crew reduce the limit to one, never zero',()=>{
 for(const condition of ['fatigue','coma','away','both-fatigued']){
  const m=game();m.choose('plan');const s=m.snapshot;
  if(condition==='fatigue'||condition==='both-fatigued')s.crew['astronaut-a'].fatigue=4;
  if(condition==='both-fatigued')s.crew['astronaut-b'].fatigue=4;
  if(condition==='coma')s.crew['astronaut-a'].comaDays=2;
  if(condition==='away')s.crew['astronaut-a']={departSol:1,returnSol:2,fatigue:0};
  m.restore(s);assert.equal(workLimit(m.snapshot),1);m.work('standby');assert.equal(workRemaining(m.snapshot),0);assert.throws(()=>m.work('rest'));
 }
});

test('event work and robot repair share the same pool; saved and legacy assignments cannot reset it',()=>{
 const m=game();m.choose('grow');assert.equal(workRemaining(m.snapshot),1);
 m.collectWithRobot();m.work('repair_robot');assert.equal(workRemaining(m.snapshot),0);
 assert.equal(m.snapshot.tools.robot,'ready');assert.equal(m.snapshot.dailySystems.spares,1);
 const r=repo();const saved=r.save(m.snapshot);const loaded=r.load(saved.id).state;m.restore(loaded);
 assert.deepEqual(m.snapshot,loaded);assert.throws(()=>m.work('standby'));
 const legacy=game();legacy.choose('grow');const old=legacy.snapshot;delete old.workIds;
 const oldSaved=r.save(old);legacy.restore(r.load(oldSaved.id).state);assert.equal(workRemaining(legacy.snapshot),1);
 legacy.work('standby');assert.equal(workRemaining(legacy.snapshot),0);assert.deepEqual(legacy.snapshot.workIds,['event:grow','standby']);
});

test('unused second assignment can be declined; repeated transmissions respect the existing daily cap',()=>{
 const m=game();m.choose('plan');const s=m.snapshot;s.localData=60;s.pendingData=0;m.restore(s);
 m.work('transmit');assert.equal(m.snapshot.pendingData,30);assert.equal(workRemaining(m.snapshot),1);
 const before=m.snapshot;assert.throws(()=>m.work('transmit'),{message:'error.transmissionFull'});assert.deepEqual(m.snapshot,before);
 m.nextSol();assert.equal(m.snapshot.sol,2);assert.equal(m.snapshot.sentData,30);
});
