import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { batteryLights } from '../src/views/BatterySlotView.js';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
const events = JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools = JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));

test('12 lamps represent every energy value, emptying each battery right to left',() => {
  for (let energy=0; energy<=12; energy++) assert.equal(batteryLights(energy).flat().filter(Boolean).length,energy);
  assert.deepEqual(batteryLights(11)[0],[true,true,true,false]);
  assert.deepEqual(batteryLights(9),[[true,false,false,false],[true,true,true,true],[true,true,true,true]]);
  assert.deepEqual(batteryLights(7),[[false,false,false,false],[true,true,true,false],[true,true,true,true]]);
});

test('generation and backup batteries respect 12E capacity',() => {
  const game = new GameModel({events:events.filter(event => !event.dailySol),tools}); game.start(['battery','toolkit']);
  assert.equal(game.snapshot.energy,9);
  game.useBattery(); assert.equal(game.snapshot.energy,12);
  const full = game.snapshot; full.tools.battery='ready'; game.restore(full);
  assert.throws(() => game.useBattery()); assert.equal(game.snapshot.tools.battery,'ready');
  game.choose('plan'); game.work('standby'); game.nextSol(); assert.equal(game.snapshot.energy,9);
});

test('legacy energy migrates without rewriting stored data; invalid/new over-cap saves are rejected',() => {
  const game = new GameModel({events,tools}); game.start(['battery','toolkit']);
  let raw;
  const repo = new SaveRepository({getItem:() => raw},{events,tools});
  for (const version of [1,2]) {
    raw=JSON.stringify({...game.snapshot,version,energy:20,food:20,dailySystems:{...game.snapshot.dailySystems,harvestFood:8}}); const before=raw;
    const loaded=repo.load().state;
    assert.equal(loaded.energy,12); assert.equal(loaded.version,5); assert.equal(raw,before);
  }
  for (const [version,energy] of [[2,21],[2,-1],[2,12.5],[3,13]]) {
    raw=JSON.stringify({...game.snapshot,version,energy}); assert.equal(repo.load().state,null);
  }
});
