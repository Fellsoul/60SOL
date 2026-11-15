import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checksum, sha256 } from '../src/services/DataChecksum.js';
import { adaptDONKI, adaptHorizons, adaptREMS, buildSnapshot, buildLiveSnapshot, validSnapshot, snapshotFresh, sourceURL } from '../src/models/SpaceData.js';
import { SpaceSnapshotService } from '../src/services/SpaceSnapshotService.js';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { choiceReason } from '../src/models/DailyEventRules.js';
import { ACTIONS, unavailableReason, workEnergy } from '../src/models/ActionRules.js';
import { spaceEvidence } from '../src/views/SpaceEvidence.js';
import { i18n } from '../src/services/I18n.js';

const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const config=await read('space_data');const events=await read('events');const tools=await read('tools');
i18n.setCatalogs({en:JSON.parse(await readFile(new URL('../locales/en.json',import.meta.url),'utf8'))});
const raw=config.cases[0].raw;
const first=()=>buildSnapshot(raw,{createdAtUTC:config.cases[0].retainedAtUTC});
const other=()=>buildSnapshot(config.cases[1].raw,{caseID:config.cases[1].id,createdAtUTC:config.cases[1].retainedAtUTC});
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};

// Synthetic timestamps exercise transport/freshness only; never shipped as source evidence.
function syntheticCurrentRaw() {const value=structuredClone(raw);value.rems.observedAtUTC='2024-05-20T00:00:00Z';return value;}
const now=()=>Date.parse('2024-05-20T12:00:00Z');
function response(value,type='application/json') {
  let read=false;
  return {ok:true,headers:{get:()=>type},body:{getReader:()=>({read:async()=>{if(read)return {done:true};read=true;return {done:false,value:new TextEncoder().encode(JSON.stringify(value))};},cancel:async()=>{}})}};
}
const transport={now,schedule:()=>1,cancel:()=>{}};

test('SHA-256 checksums are canonical and match independent known vectors',() => {
  assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(checksum({b:2,a:1}),checksum({a:1,b:2}));
});

test('verified source adapters retain real values, Mars relevance and source dates',() => {
  assert.equal(adaptDONKI(raw.donki).value,'restricted');assert.equal(adaptDONKI(config.cases[1].raw.donki).value,'caution');
  assert.equal(adaptHorizons(raw.horizons).value,15.84235931);
  assert.equal(adaptREMS(raw.rems).value,-30);assert.equal(adaptREMS(raw.rems).timePrecision,'day');
  assert.equal(snapshotFresh(first(),Date.now()),false);assert.equal(validSnapshot(first()),true);
});

test('missing fields, wrong units, generic solar notices, invalid dates and wrong targets are rejected',() => {
  assert.throws(()=>adaptREMS({...raw.rems,value:null}));assert.throws(()=>adaptREMS({...raw.rems,unit:'K'}));
  assert.throws(()=>adaptREMS({...raw.rems,observedAtUTC:'2024-02-30T00:00:00Z'}));
  assert.throws(()=>adaptDONKI({...raw.donki,messageBody:'The Moon to Mars Space Weather Analysis Office reports a CME near Earth.'}));
  assert.throws(()=>adaptHorizons({result:raw.horizons.result.replace('Earth (399)','Venus (299)')}));
  assert.throws(()=>adaptHorizons({result:raw.horizons.result.replace('Units: MINUTES','Units: DAYS')}));
  assert.equal(sourceURL('javascript:alert(1)'),null);assert.equal(sourceURL('https://science.nasa.gov.evil.test/x'),null);
});

test('saved mission data remains frozen and tampering is rejected',() => {
  const input=first();const game=new GameModel({events,tools});game.start(['toolkit','battery'],input);
  input.rules.replySols=99;assert.equal(game.snapshot.missionSnapshot.rules.replySols,2);
  const cache=memory();const repo=new SaveRepository(cache,{events,tools});const saved=repo.save(game.snapshot);
  assert.deepEqual(repo.load(saved.id).state,game.snapshot);
  const tampered=game.snapshot;tampered.missionSnapshot.observations[1].value=5;
  cache.setItem(saved.id,JSON.stringify({state:tampered}));assert.equal(repo.load(saved.id).state,null);
});

test('space data changes only bounded EVA constraints and preserves independent work',() => {
  for(const [snapshot,blocked] of [[first(),true],[other(),false]]) {
    const game=new GameModel({events,tools});game.start(['toolkit','battery'],snapshot);const state=game.snapshot;
    Object.assign(state,{sol:3,currentEventId:'E04',dusty:true});game.restore(state);
    const clean=ACTIONS.find(action=>action.id==='clean'),rest=ACTIONS.find(action=>action.id==='rest');
    assert.equal(unavailableReason(game.snapshot,clean,game.events.get('E04')),blocked?'dependency.spaceAdvisory':'');
    assert.equal(unavailableReason(game.snapshot,rest,game.events.get('E04')),'');
    if(!blocked)assert.equal(workEnergy(game.snapshot,clean),3);
  }
});

test('heating and guidance mappings affect actual morning demand and due-day availability',() => {
  const game=new GameModel({events,tools});game.start(['toolkit','battery'],first());let state=game.snapshot;
  Object.assign(state,{sol:3,currentEventId:'E04',phase:'end',choiceId:'manual',eventDone:true,energy:0,lightsOn:false,food:30});game.restore(state);
  game.nextSol();assert.equal(game.snapshot.energy,2);assert.equal(game.snapshot.health,100);
  state=game.snapshot;Object.assign(state,{sol:7,currentEventId:'E12',phase:'event',choiceId:null,eventDone:false,workId:null});game.restore(state);
  game.choose('ask');assert.equal(game.snapshot.dailySystems.labUntil,9);assert.equal(game.snapshot.spaceTrace.at(-1).snapshotID,first().snapshotID);
});

test('source outage uses ordinary gameplay instead of silently starting a hazardous historical case',async () => {
  const service=new SpaceSnapshotService(config,memory(),{...transport,fetcher:async()=>{throw Error('offline');}});
  const snapshot=await service.select('current');assert.equal(snapshot,null);
  assert.equal((await service.select('case-mars-impact')).mode,'historical');
});

test('fresh current data can be cached; later outage uses cache without replacing an active mission',async () => {
  const cache=memory();const online=new SpaceSnapshotService(config,cache,{...transport,fetcher:async()=>response(syntheticCurrentRaw())});
  const current=await online.select('current');assert.equal(current.mode,'current');
  const offline=new SpaceSnapshotService(config,cache,{...transport,fetcher:async()=>{throw Error('offline');}});
  const cached=await offline.select('current');assert.equal(cached.mode,'cached');assert.equal(validSnapshot(cached),true);
  assert.equal(current.mode,'current');assert.deepEqual(cached.observations,current.observations);
});

test('timeout, stale cache, bad content type and oversize data all use ordinary gameplay',async () => {
  let timeout;
  const stalled=new SpaceSnapshotService(config,memory(),{now,fetcher:()=>new Promise(()=>{}),schedule:fn=>{timeout=fn;return 1;},cancel:()=>{}});
  const waiting=stalled.select('current');timeout();assert.equal(await waiting,null);
  const cache=memory();cache.setItem('outpost.space-data.v1',JSON.stringify(first()));
  for(const fetcher of [async()=>response({},'text/html'),async()=>response({x:'x'.repeat(140000)}),async()=>response({})]) {
    const service=new SpaceSnapshotService(config,cache,{...transport,fetcher});
    assert.equal(await service.select('current'),null);
  }
});

test('two historical cases start with identical resources and seed but different declared constraints',() => {
  const a=new GameModel({events,tools}),b=new GameModel({events,tools});a.start(['toolkit','battery'],first());b.start(['toolkit','battery'],other());
  for(const key of ['energy','food','health','rng','sol'])assert.equal(a.snapshot[key],b.snapshot[key]);
  assert.notEqual(a.snapshot.missionSnapshot.rules.advisory,b.snapshot.missionSnapshot.rules.advisory);
  const html=spaceEvidence(a.snapshot);assert.ok(html.includes('Historical replay'));assert.ok(html.includes('15.842'));assert.ok(html.includes('In this simulation'));
});


test('partial current input uses real light time without inventing a solar restriction or temperature',async()=>{
  const pack={schemaVersion:2,horizons:raw.horizons};
  const service=new SpaceSnapshotService(config,memory(),{...transport,fetcher:async()=>response(pack)});
  const snapshot=await service.select('current');
  assert.equal(snapshot.schemaVersion,2);assert.equal(snapshot.mode,'current');assert.ok(validSnapshot(snapshot));
  assert.equal(snapshot.observations.length,1);assert.equal(snapshot.rules.advisory,'unknown');
  assert.deepEqual(snapshot.rules.advisorySols,[]);assert.equal(snapshot.rules.heatingExtra,0);
  assert.equal(snapshot.rules.replySols,2);
  const game=new GameModel({events,tools});game.start(['toolkit','battery'],snapshot);
  const state=game.snapshot;Object.assign(state,{sol:3,dusty:true});game.restore(state);
  assert.notEqual(unavailableReason(game.snapshot,ACTIONS.find(a=>a.id==='clean'),game.events.get(state.currentEventId)),'dependency.spaceAdvisory');
  game.choose('abandon');game.work('standby');
  const repo=new SaveRepository(memory(),{events,tools});const saved=repo.save(game.snapshot);
  assert.deepEqual(repo.load(saved.id).state,game.snapshot);
  const altered=structuredClone(snapshot);altered.rules.advisory='restricted';assert.equal(validSnapshot(altered),false);
  assert.throws(()=>buildLiveSnapshot({schemaVersion:2}));
});
