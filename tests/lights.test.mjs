import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { GameController } from '../src/controllers/GameController.js';
import { LightSwitchView } from '../src/views/LightSwitchView.js';

const events = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools = JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));

test('tabletop switch saves immediately without consuming work, energy, or a Sol',async () => {
  const model = new GameModel({events,tools}); model.start(['toolkit','battery']);
  const before = model.snapshot; const saved = [];
  const view = {menu:{closeSaves(){},hide(){}},tasks:{close(){}},closeTerminal:async () => {},render:async () => {}};
  const controller = new GameController(model,view,{save:state => { saved.push(state); return {ok:true,id:'switch'}; }});
  await controller.toggleLights();
  assert.equal(model.snapshot.lightsOn,false);
  assert.equal(saved[0].lightsOn,false);
  for (const key of ['energy','sol','phase','workId','choiceId']) assert.equal(model.snapshot[key],before[key]);
  await controller.toggleLights();
  assert.equal(model.snapshot.lightsOn,true);
  assert.equal(saved.length,2);
  assert.equal(model.snapshot.daySummary.filter(key => key.startsWith('summary.lightsSwitched')).length,1);
  controller.busy=true; await controller.toggleLights(); assert.equal(saved.length,2);
});

test('switch reflects state and disables turning on without power or after mission end',() => {
  const previous = globalThis.document;
  const attributes = {};
  globalThis.document = {createElement:() => ({setAttribute:(name,value) => { attributes[name]=value; }})};
  try {
    const view = new LightSwitchView();
    view.render({lightsOn:true,energy:0,phase:'work'});
    assert.equal(view.toggle.disabled,false); assert.equal(attributes['aria-pressed'],'true');
    view.render({lightsOn:false,energy:0,phase:'work'});
    assert.equal(view.toggle.disabled,true); assert.equal(attributes['aria-pressed'],'false');
    view.render({lightsOn:false,energy:5,phase:'work'},{busy:true}); assert.equal(view.toggle.disabled,true);
    view.render({lightsOn:true,energy:5,phase:'finished'}); assert.equal(view.toggle.disabled,true);
    view.render(null); assert.equal(view.toggle.hidden,true);
  } finally { globalThis.document=previous; }
});
