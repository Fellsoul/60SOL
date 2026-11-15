import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameModel} from '../src/models/GameModel.js';
import {SaveRepository} from '../src/repositories/SaveRepository.js';
import {guideTarget} from '../src/views/DailyGuide.js';
const events=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url))).filter(e=>!e.dailySol);
const tools=JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url)));
const content={events,tools};
test('first three mornings guide terminal then notebook once, save progress, and stop on day four',()=>{
 const model=new GameModel(content);model.start(['toolkit','battery']);
 let raw;const repo=new SaveRepository({getItem:()=>raw,setItem:(_,v)=>{raw=v;}},content);
 for(let sol=1;sol<=3;sol++){
  assert.equal(model.snapshot.sol,sol);assert.equal(guideTarget(model.snapshot),'terminal');
  assert.equal(model.markGuideOpened('notebook'),false);assert.equal(guideTarget(model.snapshot),'terminal');
  const before=model.snapshot;
  assert.equal(model.markGuideOpened('terminal'),true);assert.equal(guideTarget(model.snapshot),'notebook');
  const saved=repo.save(model.snapshot);model.restore(repo.load(saved.id).state);assert.equal(guideTarget(model.snapshot),'notebook');
  assert.equal(model.markGuideOpened('terminal'),false);assert.equal(model.markGuideOpened('notebook'),true);
  assert.equal(guideTarget(model.snapshot),null);assert.equal(model.markGuideOpened('notebook'),false);
  for(const key of ['energy','food','health','workId','choiceId','phase','rng'])assert.equal(model.snapshot[key],before[key]);
  const done=repo.save(model.snapshot);model.restore(repo.load(done.id).state);assert.equal(guideTarget(model.snapshot),null);
  model.choose(model.events.get(model.snapshot.currentEventId).choices.find(c=>!c.work).id);model.work('standby');model.nextSol();
 }
 assert.equal(model.snapshot.sol,4);assert.equal(guideTarget(model.snapshot),null);assert.equal(model.markGuideOpened('terminal'),false);
 assert.equal(guideTarget({...model.snapshot,sol:2,outcome:'unsafe'}),null);
 assert.equal(guideTarget(null),null);
});
test('legacy saves need no guide field and malformed progress is rejected',()=>{
 const model=new GameModel(content);model.start(['toolkit','battery']);const state=model.snapshot;delete state.guide;
 let raw;const repo=new SaveRepository({getItem:()=>raw,setItem:(_,v)=>{raw=v;}},content);
 const old=repo.save(state);model.restore(repo.load(old.id).state);assert.equal(guideTarget(model.snapshot),'terminal');
 assert.equal(model.markGuideOpened('terminal'),true);assert.equal(guideTarget(model.snapshot),'notebook');
 for(const guide of [null,{terminalSol:0,notebookSol:1},{terminalSol:4,notebookSol:0},{terminalSol:'1',notebookSol:0}]){
  const saved=repo.save({...state,guide});assert.equal(repo.load(saved.id).state,null);
 }
});
