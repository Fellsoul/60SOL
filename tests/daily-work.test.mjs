import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { dailyActivitiesComplete } from '../src/models/DailyWorkRules.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const content={events:(await read('events')).filter(e=>!e.dailySol),tools:await read('tools')};
function game(){const m=new GameModel(content);m.start(['toolkit','battery']);return m;}
const complete=m=>dailyActivitiesComplete(m.snapshot,m.events.get(m.snapshot.currentEventId));
test('sampling unlocks after the event and daily work, not just a free event response',()=>{
  const m=game();assert.equal(complete(m),false);
  m.choose('plan');assert.equal(complete(m),false);
  m.work('grow');assert.equal(complete(m),true);
});
test('a work-consuming event unlocks sampling; unresolved concurrent incidents keep it locked',()=>{
  const m=game();m.choose('grow');assert.equal(complete(m),true);
  const s=m.snapshot;s.concurrentEvents=[{id:'pending',eventId:'E14',choiceId:null}];m.restore(s);
  assert.equal(complete(m),false);
});
test('no actionable daily activity unlocks optional sampling and permits ending the day',()=>{
  const m=game();m.choose('plan');const s=m.snapshot;s.energy=0;m.restore(s);
  assert.equal(complete(m),true);assert.equal(m.snapshot.workId,null);
  m.nextSol();assert.equal(m.snapshot.sol,2);assert.equal(m.snapshot.expeditionPlan,null);
  assert.ok(Object.values(m.snapshot.crew).every(crew=>crew.departSol===null));
});
test('unchecking a confirmed plan cancels departure',()=>{
  const m=game();m.choose('grow');m.planExpedition('astronaut-a');m.planExpedition(null);m.nextSol();
  assert.equal(m.snapshot.expeditionPlan,null);assert.equal(m.snapshot.crew['astronaut-a'].departSol,null);
});
