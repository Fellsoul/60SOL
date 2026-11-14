import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { clipboardTasks } from '../src/views/TaskView.js';

const events = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8')).filter(event => !event.dailySol);
const tools = JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
const game = () => { const model = new GameModel({events,tools}); model.start(['toolkit','battery']); return model; };
const rows = model => clipboardTasks(model.snapshot,model.events.get(model.snapshot.currentEventId));

test('event work is offered on the clipboard before making a terminal decision',() => {
  const model = game();
  const task = rows(model).find(task => task.id === 'grow' && task.command === 'choose');
  assert.ok(task); assert.equal(task.reason,''); assert.equal(task.done,false);
  model.choose(task.id);
  assert.equal(rows(model).find(task => task.command === 'choose').done,true);
  assert.equal(model.snapshot.sol,1);
});

test('completed and unfinished tasks coexist after completion and restoring a save',() => {
  const model = game(); model.choose('plan'); model.work('research');
  const state = model.snapshot; const restored = new GameModel({events,tools}); restored.restore(state);
  for (const current of [model,restored]) {
    const tasks = rows(current);
    assert.equal(tasks.find(task => task.id === 'research').done,true);
    assert.equal(tasks.find(task => task.id === 'grow').done,false);
    assert.equal(tasks.find(task => task.id === 'grow').reason,'error.workUsed');
    assert.equal(tasks.filter(task => task.done && task.command === 'work').length,1);
    assert.ok(!tasks.some(task => task.id === 'robot'));
    assert.throws(() => current.work('research'));
    assert.deepEqual(current.snapshot,state);
  }
});

test('unfinished tasks expose resource restrictions and reset for the next Sol',() => {
  const model = game(); model.choose('plan');
  const state = model.snapshot; state.energy=0; model.restore(state);
  assert.equal(rows(model).find(task => task.id === 'research').reason,'error.powerInsufficient');
  assert.equal(rows(model).find(task => task.id === 'standby').reason,'');
  model.work('standby'); model.nextSol();
  assert.ok(rows(model).every(task => !task.done));
});
