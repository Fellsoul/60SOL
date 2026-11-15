import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { advanceExpeditions, recoverCrew, crewAway, expeditionReason } from '../src/models/ExpeditionRules.js';
import { sceneState } from '../src/views/SceneState.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { finishSol } from '../src/models/TurnEngine.js';
import { ACTIONS } from '../src/models/ActionRules.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url),'utf8'));
const content={events:(await read('events')).filter(e=>!e.dailySol),tools:await read('tools')};
test('whole samples, including old two-use samples, yield 20 and use the daily work slot',()=>{
 const m=new GameModel(content);m.start(['monitor','battery']);m.choose('plan');const s=m.snapshot;s.samples=[2];m.restore(s);m.work('research');
 assert.equal(m.snapshot.localData,20);assert.deepEqual(m.snapshot.samples,[]);assert.equal(m.snapshot.workId,'research');assert.throws(()=>m.work('research'));
 assert.ok(!ACTIONS.some(a=>a.id==='monitor'));assert.throws(()=>m.work('monitor'));
});
test('two-day storm trips survive saves, return unconscious and recover on two fed days starting on return',()=>{
 const m=new GameModel(content);m.start(['monitor','battery']);const s=m.snapshot;
 s.sol=2;s.weather='sandstorm';s.expeditionPlan={crewId:'astronaut-a',departSol:2};advanceExpeditions(s);
 assert.equal(s.crew['astronaut-a'].returnSol,4);assert.ok(crewAway(s,'astronaut-a'));
 s.sol=3;advanceExpeditions(s);assert.ok(crewAway(s,'astronaut-a'));
 let raw;const repo=new SaveRepository({getItem:()=>raw,setItem:(_,v)=>raw=v},content);repo.save(s);assert.deepEqual(repo.load().state,s);
 s.sol=4;advanceExpeditions(s);assert.equal(sceneState(s).crewA,'sleep');assert.equal(s.crew['astronaut-a'].comaDays,2);assert.equal(expeditionReason(s,'astronaut-a'),'error.crewUnconscious');
 repo.save(s);assert.deepEqual(repo.load().state,s);
 s.food=7;finishSol(s);assert.equal(s.crew['astronaut-a'].comaDays,2);
 s.food=8;s.sol=5;finishSol(s);assert.equal(s.crew['astronaut-a'].comaDays,1);
 s.food=8;s.sol=6;s.lightsOn=false;finishSol(s);assert.equal(s.crew['astronaut-a'].comaDays,0);
 const b=s.crew['astronaut-b'];b.comaDays=2;recoverCrew(s,false,true);assert.equal(b.comaDays,1);recoverCrew(s,true,true);assert.equal(b.comaDays,0);
});
