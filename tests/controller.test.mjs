import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/controllers/GameController.js';
import { GameView } from '../src/views/GameView.js';

function fixture() {
  const calls = [];
  const state = {sol:3,currentEventId:'routine'};
  const event = {id:'routine'};
  const model = {snapshot:state,events:{get:() => event}};
  const view = {
    terminal:{dialog:{open:true},isConsole:true},
    tasks:{close:() => calls.push('closeTasks')},
    menu:{closeSaves:() => {},hide:() => {}},
    closeTerminal:async () => calls.push('closeTerminal'),
    refreshTerminal:async () => calls.push('refreshTerminal'),
    render:async () => calls.push('render'),
    startTransitionAudio:() => calls.push('morning'),
    notify:message => { throw new Error(message); },
  };
  const repository = {save:() => { calls.push('save'); return {ok:true,id:'slot'}; }};
  return {calls,view,controller:new GameController(model,view,repository)};
}

test('clipboard completion saves and renders without closing the clipboard or starting a morning',async () => {
  const {calls,controller} = fixture();
  await controller.commit(() => {},{keepTasksOpen:true});
  assert.deepEqual(calls,['save','closeTerminal','render']);
  assert.equal(controller.busy,false);
});

test('terminal decisions preserve the open console and refresh its content',async () => {
  const {calls,controller} = fixture();
  await controller.commit(() => {},{keepTerminal:true});
  assert.deepEqual(calls,['save','refreshTerminal']);
  assert.equal(controller.busy,false);
});

test('ending the day closes both panels and starts the morning transition',async () => {
  const {calls,controller} = fixture();
  await controller.commit(() => {},{morning:true});
  assert.deepEqual(calls,['save','morning','closeTasks','closeTerminal','render']);
});

test('refreshing the terminal also updates clipboard state after the event decision',async () => {
  const calls = [];
  const state = {phase:'work'}; const event = {id:'routine'};
  const view = {
    reducedMotion:true,
    terminal:{fadeContentOut:async () => calls.push('fade'),render:() => calls.push('terminal'),typeContent:() => calls.push('type')},
    scene:{render:async () => calls.push('scene')},
    tasks:{render:actual => { assert.equal(actual,state); calls.push('tasks'); }},
  };
  await GameView.prototype.refreshTerminal.call(view,state,event);
  assert.deepEqual(calls,['fade','scene','tasks','terminal','type']);
  assert.equal(view.state,state);
});
