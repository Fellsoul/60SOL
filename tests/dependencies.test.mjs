import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { ACTIONS, unavailableReason } from '../src/models/ActionRules.js';
import { choiceReason } from '../src/models/DailyEventRules.js';
import { clipboardTasks } from '../src/views/TaskView.js';

const events=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools=JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
function pending(id,toolIds=['robot','battery'],energy=3) {
  const model=new GameModel({events,tools});model.start(toolIds);
  const state=model.snapshot;
  Object.assign(state,{sol:4,currentEventId:id,energy,weather:'clear',health:90,localData:12});
  model.restore(state);return model;
}
const rows=model=>clipboardTasks(model.snapshot,model.events.get(model.snapshot.currentEventId));

test('missing toolkit blocks lab repair, not greenhouse, rest or transmission; fallback is on clipboard',() => {
  const model=pending('E07');const tasks=rows(model);
  assert.equal(tasks.find(task=>task.command==='choose'&&task.id==='repair').reason,'error.toolUnavailable');
  for(const id of ['grow','rest','transmit'])assert.equal(tasks.find(task=>task.command==='work'&&task.id===id).reason,'');
  assert.equal(tasks.find(task=>task.command==='work'&&task.id==='research').reason,'dependency.labThermal');
  const fallback=tasks.find(task=>task.command==='choose'&&task.id==='close');
  assert.equal(fallback.reason,'');assert.equal(fallback.energy,0);assert.equal(fallback.work,false);
  assert.throws(()=>model.work('research'),{message:'dependency.labThermal'});
});

test('independent work before event response survives reload; responding does not grant another work slot',() => {
  const model=pending('E07');model.work('rest');
  assert.equal(model.snapshot.health,98);assert.equal(model.snapshot.energy,2);
  assert.equal(model.snapshot.phase,'event');assert.equal(model.snapshot.eventDone,false);assert.equal(model.snapshot.workId,'rest');
  assert.throws(()=>model.nextSol(),{message:'error.eventUnresolved'});
  const items=new Map();const repo=new SaveRepository({getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)},{events,tools});
  const saved=repo.save(model.snapshot);const restored=new GameModel({events,tools});restored.restore(repo.load(saved.id).state);
  assert.deepEqual(restored.snapshot,model.snapshot);
  const before=restored.snapshot;assert.throws(()=>restored.work('rest'));assert.deepEqual(restored.snapshot,before);
  restored.choose('close');assert.equal(restored.snapshot.phase,'end');assert.equal(restored.snapshot.workId,'rest');assert.equal(restored.snapshot.energy,2);
  assert.throws(()=>restored.work('standby'));restored.nextSol();assert.equal(restored.snapshot.sol,5);
});

test('zero energy and no repair supplies still allow independent standby and a free event response',() => {
  const model=pending('E07',['robot','battery'],0);const state=model.snapshot;state.dailySystems.spares=0;model.restore(state);
  model.work('standby');assert.equal(rows(model).find(task=>task.id==='close').reason,'');
  model.choose('close');model.nextSol();assert.equal(model.snapshot.sol,5);
});

test('only genuine affected operations are blocked by pending problems',() => {
  for(const [eventId,blocked,allowed] of [['E04','grow','research'],['E09','grow','rest'],['E12','research','grow'],['E17','research','transmit'],['E16','transmit','rest']]) {
    const model=pending(eventId);const event=model.events.get(eventId);
    assert.equal(unavailableReason(model.snapshot,ACTIONS.find(action=>action.id===blocked),event),event.blockReason);
    assert.equal(unavailableReason(model.snapshot,ACTIONS.find(action=>action.id===allowed),event),'');
  }
});

test('a radiation emergency requires shelter and retains a zero-energy response',() => {
  const model=pending('E19');const event=model.events.get('E19');
  for(const action of ACTIONS) {
    if(!action.tool)assert.equal(unavailableReason(model.snapshot,action,event),'dependency.shelter');
  }
  assert.equal(rows(model).find(task=>task.id==='minimum').reason,'');
  model.choose('minimum');assert.equal(model.snapshot.eventDone,true);assert.equal(model.snapshot.phase,'end');
});

test('related panel work resolves the matching event once at its actual response cost',() => {
  const model=pending('E20');model.work('clean');
  assert.equal(model.snapshot.choiceId,'inspect_clean');assert.equal(model.snapshot.eventDone,true);assert.equal(model.snapshot.energy,0);
  assert.equal(model.snapshot.phase,'end');assert.throws(()=>model.work('clean'));
  const repair=pending('E02',['toolkit','battery']);const state=repair.snapshot;state.dailySystems.spares=0;repair.restore(state);
  assert.throws(()=>repair.work('repair'),{message:'error.sparesInsufficient'});
  assert.equal(repair.snapshot.energy,3);assert.equal(repair.snapshot.eventDone,false);
});

test('every event permitting independent work has a response that remains feasible after spending the work slot',() => {
  for(const event of events.filter(event=>event.dailySol)) {
    const model=pending(event.id,['toolkit','battery'],12);const state=model.snapshot;
    if(!ACTIONS.some(action=>!unavailableReason(state,action,event)))continue;
    Object.assign(state,{energy:0,workId:'standby'});
    assert.ok(event.choices.some(choice=>!choice.work&&!choiceReason(state,choice)),`${event.id} needs a no-work fallback`);
  }
});
