import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { validateState } from '../src/models/state.js';
import { TerminalView } from '../src/views/TerminalView.js';
import { i18n } from '../src/services/I18n.js';
import { escapeHtml } from '../src/views/dom.js';

const read = async path => JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const content = {events:(await read('../data/events.json')).filter(event => !event.dailySol),tools:await read('../data/tools.json')};
const languages = await read('../locales/languages.json');
i18n.setCatalogs(Object.fromEntries(await Promise.all(languages.map(async ({code}) => [code,await read(`../locales/${code}.json`)]))));
const valid = state => validateState(state,content.events.map(e => e.id),content.tools.map(t => t.id));
function model() { const game = new GameModel(content); game.start(['toolkit','battery']); return game; }
function repository() {
  const storage = new Map();
  return new SaveRepository({getItem:key => storage.get(key),setItem:(key,value) => storage.set(key,value)},content);
}

test('day 14 remains playable; its transmission and rations settle once before SOL 15 ends the mission',() => {
  for (const [health,food,sentData,outcome] of [[100,80,30,'success'],[100,80,29,'incomplete'],[12,0,30,'sacrifice'],[12,0,29,'unsafe']]) {
    const game=model(); const state=game.snapshot;
    Object.assign(state,{sol:14,health,food,sentData,localData:30}); game.restore(state);
    assert.equal(game.snapshot.outcome,null);
    game.choose('plan'); game.work('transmit');
    assert.equal(game.snapshot.outcome,null);
    game.nextSol(); const ended=game.snapshot;
    assert.equal(ended.sol,15); assert.equal(ended.summarySol,14); assert.equal(ended.outcome,outcome);
    assert.equal(ended.sentData,sentData+30); assert.equal(ended.pendingData,0);
    assert.equal(ended.food,Math.max(0,food-8)); assert.equal(ended.currentEventId,'arrival');
    assert.equal(ended.missionJournal.at(-1).sol,14);
    assert.ok(valid(ended));
    assert.throws(() => game.nextSol()); assert.deepEqual(game.snapshot,ended);
    const repo=repository(); const saved=repo.save(ended);
    assert.deepEqual(repo.load(saved.id).state,ended);
  }
});

test('all unconscious crew end the mission immediately; delivered research takes priority even before day 14',() => {
  for (const sentData of [59,60]) {
    const game=model(); const state=game.snapshot;
    Object.assign(state,{sol:5,sentData,pendingData:1});
    for (const crew of Object.values(state.crew)) crew.comaDays=1;
    game.restore(state); const ended=game.snapshot;
    assert.equal(ended.outcome,sentData === 60 ? 'sacrifice' : 'unsafe');
    assert.equal(ended.sol,5); assert.equal(ended.phase,'finished');
    assert.equal(ended.pendingData,1); assert.equal(ended.crew['astronaut-a'].comaDays,1);
    assert.equal(ended.missionJournal.at(-1).events[0].choiceId,null);
    assert.ok(valid(ended));
    const repo=repository(); const saved=repo.save(ended);
    assert.deepEqual(repo.load(saved.id).state,ended); // Failure before choosing an event is loadable.
  }
});

test('a storm expedition returning to an unconscious crewmate triggers an ending on arrival',() => {
  const game=model(); game.choose('plan'); game.work('standby');
  const state=game.snapshot;
  Object.assign(state,{sol:3,food:0,health:100,sentData:60});
  state.crew['astronaut-a']={departSol:2,returnSol:4,fatigue:0};
  state.crew['astronaut-b'].comaDays=2;
  game.restore(state); game.nextSol();
  assert.equal(game.snapshot.sol,4); assert.equal(game.snapshot.outcome,'sacrifice');
  assert.equal(game.snapshot.crew['astronaut-a'].comaDays,2);
  assert.deepEqual(game.snapshot.missionJournal.map(day => day.sol),[3,4]);
});

test('journal archives primary, concurrent and emergency choices with separate event overviews',() => {
  const game=model(); const state=game.snapshot;
  Object.assign(state,{weather:'sandstorm',dusty:true,energy:0});
  state.concurrentEvents=[{id:'extra',eventId:'dust',choiceId:null}]; game.restore(state);
  game.choose('plan'); game.chooseConcurrent('extra','defer'); game.chooseEmergencyClean('force_clean'); game.nextSol();
  const day=game.snapshot.missionJournal[0];
  assert.deepEqual(day.events.map(event => [event.eventId,event.choiceId]),[['arrival','plan'],['dust','defer'],['emergency_clean','force_clean']]);
  assert.equal(day.events[0].summaryLine,'event.arrival.endingSummary');
  assert.equal(day.events[0].choiceSummary,'event.arrival.choice.plan.summaryLine');
  const repo=repository();const saved=repo.save(game.snapshot);game.restore(repo.load(saved.id).state);
  assert.deepEqual(game.snapshot.missionJournal[0],day);
  const snapshot=game.snapshot;snapshot.daySummary.push('new day');assert.deepEqual(game.snapshot.missionJournal[0],day);
});

test('legacy journals retain only known days and reject malformed archived data',() => {
  const game=model(); game.choose('grow'); game.nextSol();
  const old=game.snapshot; delete old.missionJournal;
  const repo=repository(); const saved=repo.save(old);
  const loaded=repo.load(saved.id).state; game.restore(loaded);
  assert.deepEqual(game.snapshot.missionJournal.map(day => day.sol),[1]);
  assert.deepEqual(game.snapshot.missionJournal[0].summary,old.previousDaySummary);
  assert.equal(loaded.missionJournal,undefined);
  for (const corrupt of [null,[{sol:1}],[...game.snapshot.missionJournal,...game.snapshot.missionJournal]]) {
    const bad={...game.snapshot,missionJournal:corrupt};assert.equal(valid(bad),false);
  }
  const bad=game.snapshot;bad.missionJournal[0].resources[0].changes.energy=Infinity;assert.equal(valid(bad),false);
  assert.equal(valid({...game.snapshot,sol:15}),false);
});

test('ending report lists days in order, selected choices once, and marks unknown legacy days',() => {
  const game=model();game.choose('plan');game.work('standby');game.nextSol();
  const state=game.snapshot;Object.assign(state,{sol:3,summarySol:3,outcome:'success'});
  state.missionJournal.push({sol:3,summary:[],resources:[],events:[]});
  const view={resourceLog:{},copy:TerminalView.prototype.copy,resourceSummary:TerminalView.prototype.resourceSummary};
  for (const {code:language} of languages) {
    i18n.language=language;
    const html=TerminalView.prototype.missionSummary.call(view,state);
    assert.deepEqual([...html.matchAll(/data-sol="(\d+)"/g)].map(match => match[1]),['1','2','3']);
    assert.ok(html.includes(escapeHtml(i18n.t('ending.missingLog'))),language);
    assert.ok(html.includes(escapeHtml(i18n.t('event.arrival.endingSummary'))),language);
    assert.equal(html.split(escapeHtml(i18n.t('event.arrival.choice.plan.summaryLine'))).length-1,1);
    assert.ok(!html.includes('data-action="next"'));
  }
});
