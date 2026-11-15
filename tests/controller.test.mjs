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

test('new missions save selected equipment and difficulty before the intro, then enter SOL 001 only after playback finishes',async () => {
  const model = new GameModel({events,tools});const saved = [];let rendered = null,finishIntro,terminalClosed=false;
  const view = {
    intro:{active:false,finishSetup:() => new Promise(resolve => { finishIntro=resolve; }),stop(){this.active=false;}},
    startIntro(){assert.equal(terminalClosed,true);assert.equal(saved.length,1);this.intro.active=true;},
    coverScene(){},startTransitionAudio(){},closeTerminal:async () => {terminalClosed=true;},
    menu:{closeSaves(){},hide(){}},tasks:{close(){}},
    render:async state => { rendered=state; },notify(){}
  };
  const controller = new GameController(model,view,{save:state => { saved.push(state);return {ok:true,id:'intro'}; }});
  controller.pendingDifficulty = 'hard';
  const starting = controller.startMission(['toolkit','battery'],'current',{intro:true});
  for (let i=0;i<5;i++) await Promise.resolve();
  assert.equal(saved.length,1);assert.equal(saved[0].difficulty,'hard');
  assert.deepEqual(Object.keys(saved[0].tools),['toolkit','battery']);
  assert.equal(controller.busy,true);assert.equal(rendered,null);
  assert.equal(view.intro.active,true);
  await controller.toggleLights();assert.equal(saved.length,1);
  finishIntro();await starting;
  assert.equal(rendered.sol,1);assert.equal(view.intro.active,false);assert.equal(controller.busy,false);
});
