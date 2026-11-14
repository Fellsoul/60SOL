import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { GameController } from '../src/controllers/GameController.js';

const events = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8')).filter(event => !event.dailySol);
const tools = JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));

test('terminal light switch saves immediately and keeps the terminal open without consuming work, energy, or a Sol',async () => {
  const model = new GameModel({events,tools}); model.start(['toolkit','battery']);
  const before = model.snapshot; const saved = [];
  let refreshes = 0;
  const view = {terminal:{dialog:{open:true},isConsole:true},refreshTerminal:async () => { refreshes++; }};
  const controller = new GameController(model,view,{save:state => { saved.push(state); return {ok:true,id:'switch'}; }});
  await controller.toggleLights();
  assert.equal(model.snapshot.lightsOn,false);
  assert.equal(saved[0].lightsOn,false);
  for (const key of ['energy','sol','phase','workId','choiceId']) assert.equal(model.snapshot[key],before[key]);
  await controller.toggleLights();
  assert.equal(model.snapshot.lightsOn,true);
  assert.equal(saved.length,2);
  assert.equal(refreshes,2);
  assert.equal(model.snapshot.daySummary.filter(key => key.startsWith('summary.lightsSwitched')).length,1);
  controller.busy=true; await controller.toggleLights(); assert.equal(saved.length,2);
});

test('terminal light control ignores unavailable states',async () => {
  const model = new GameModel({events,tools}); model.start(['toolkit','battery']);
  const controller = new GameController(model,{},{});
  controller.commit = async () => { throw new Error('Unavailable light control must not commit'); };
  const state = model.snapshot;
  model.restore({...state,lightsOn:false,energy:0}); await controller.toggleLights();
  model.restore({...state,phase:'finished',outcome:'success'}); await controller.toggleLights();
  model.restore(null); await controller.toggleLights();
});
