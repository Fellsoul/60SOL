import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CrewMotion } from '../src/views/CrewMotion.js';
import { GameView } from '../src/views/GameView.js';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { MovementDirector, movementSteps, safeVisualState } from '../src/views/MovementDirector.js';
import { SceneAssets } from '../src/views/SceneAssets.js';
import { sceneState } from '../src/views/SceneState.js';
import { validVisualAction } from '../src/models/VisualAction.js';
import { projectFloorPoint, projectUpright, validateRoute, sampleRoute, RouteReservations } from '../src/views/MovementGeometry.js';

const events=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const tools=JSON.parse(await readFile(new URL('../data/tools.json',import.meta.url),'utf8'));
const game=()=>{const model=new GameModel({events,tools});model.start(['toolkit','battery']);return model;};
function acceptedEVA() { const model=game();model.choose('secure');return {model,plan:model.snapshot.visualAction}; }
function clock() {
  let time=0,serial=0;const jobs=new Map(),frames=[];
  const director=new MovementDirector({onFrame:frame=>frames.push(frame),now:()=>time,schedule:(fn)=>{jobs.set(++serial,fn);return serial;},cancel:id=>jobs.delete(id)});
  return {director,frames,jobs,advance:ms=>{time=ms;const current=[...jobs.values()];jobs.clear();current.forEach(fn=>fn());}};
}

test('accepted work persists a safe semantic visual plan before playback',() => {
  const {model,plan}=acceptedEVA();assert.ok(validVisualAction(plan));assert.equal(plan.mode,'eva');assert.equal(plan.cost.energy,2);
  const values=new Map();const repo=new SaveRepository({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},{events,tools});
  const saved=repo.save(model.snapshot);assert.deepEqual(repo.load(saved.id).state,model.snapshot);
});

test('normal, skip, reduced-motion, hidden-tab and restored presentations have identical game state',() => {
  const {model,plan}=acceptedEVA();const before=model.snapshot;
  for(const mode of ['normal','skip','reduced','hidden','restore']) {
    const {director,frames,advance}=clock();
    if(mode==='restore')director.restore(plan);
    else {
      director.present(plan,{reducedMotion:mode==='reduced',hidden:mode==='hidden'});
      if(mode==='normal')for(const step of movementSteps(plan))advance(step.at);
      else director.skip();
    }
    assert.equal(frames.at(-1).key,'complete');assert.ok(frames.every(frame=>safeVisualState(frame.state)));
    assert.deepEqual(model.snapshot,before);assert.equal(director.active,null);
  }
});

test('EVA checkpoints keep both hatches and doffing in safe order, including Skip',() => {
  const {plan}=acceptedEVA();const {director,frames}=clock();director.present(plan);director.skip();
  assert.deepEqual(frames.map(frame=>frame.key),movementSteps(plan).map(step=>step.key));
  assert.ok(frames.every(frame=>!frame.state.outsideVisible));
  const doff=frames.find(frame=>frame.key==='doffing');assert.ok(doff.state.insideProtected&&doff.state.repressurized&&doff.state.outerClosed);
  assert.equal(safeVisualState({...doff.state,outsideVisible:true}),false);
  assert.equal(safeVisualState({...doff.state,outerClosed:false,innerClosed:false}),false);
});

test('duplicates and stale callbacks cannot restart or supersede the current actor sequence',() => {
  const {plan}=acceptedEVA();const {director,frames,jobs}=clock();director.present(plan);const stale=[...jobs.values()][0];
  assert.equal(director.present(plan),false);
  director.present({...plan,id:'new-action'});const count=frames.length;stale();assert.equal(frames.length,count);
  director.skip();assert.equal(frames.at(-1).plan.id,'new-action');
});

test('pacing is elapsed-time based, bounded and safe after a suspended tab',() => {
  const {plan}=acceptedEVA();assert.ok(movementSteps(plan).at(-1).at<=6000);
  assert.ok(movementSteps({...plan,mode:'interior'}).at(-1).at<=4000);
  const {director,frames,advance}=clock();director.present(plan);assert.equal(frames[0].key,'foregroundCut');advance(60000);
  assert.equal(director.active,null);assert.equal(frames.at(-1).key,'complete');
});

const camera={P:[[1,0,0,0],[0,0,-1,2],[0,1,0,1]],nearClip:.1,billboardRight:[1,0]};
const geometry={status:'validated',camera,walkablePolygon:[[0,0],[10,0],[10,10],[0,10]],obstacles:[{polygon:[[4,4],[6,4],[6,6],[4,6]],minHeight:0}]};
const route={approved:true,waypoints:[[2,2],[8,2]],envelope:{radius:.3,height:1.8,margin:.1}};

test('projection preserves perspective and rejects the near plane',() => {
  assert.equal(projectFloorPoint(camera,[0,-1,0]),null);
  const near=projectUpright(camera,[2,2],.6,1.8),far=projectUpright(camera,[2,8],.6,1.8);
  assert.ok(near&&far);assert.ok(Math.abs(near[0].y-near[3].y)>Math.abs(far[0].y-far[3].y));
});

test('clearance validates whole segments, inflated corners and head clearance; unapproved geometry stays disabled',() => {
  assert.equal(validateRoute(route,geometry).ok,true);
  assert.equal(validateRoute({...route,waypoints:[[2,2],[8,8]]},geometry).ok,false);
  assert.equal(validateRoute({...route,waypoints:[[2,3.7],[8,3.7]]},geometry).ok,false);
  assert.equal(validateRoute({...route,waypoints:[[.2,2],[.2,8]]},geometry).ok,false);
  assert.equal(validateRoute(route,{...geometry,status:'pending'}).ok,false);
  const overhang={...geometry,obstacles:[{polygon:[[4,1],[6,1],[6,3],[4,3]],minHeight:1.5}]};
  assert.equal(validateRoute(route,overhang).ok,false);
});

test('distance sampling and passage reservations do not depend on rendering frame count',() => {
  const sampled=sampleRoute([[0,0],[2,0],[2,2]],3,.8);assert.deepEqual(sampled.position,[2,1]);
  const locks=new RouteReservations();assert.equal(locks.reserve('a',1,['narrow']),true);assert.equal(locks.reserve('b',1,['narrow']),false);
  locks.reserve('a',2,['narrow']);locks.release('a',1);assert.equal(locks.reserve('b',1,['narrow']),false);
  locks.release('a',2);assert.equal(locks.reserve('b',1,['narrow']),true);
});

test('stalled and late art loads resolve to fallback instead of holding an accepted action',async () => {
  const image={};const jobs=[];
  const assets=new SceneAssets({imageFactory:()=>image,schedule:fn=>{jobs.push(fn);return 1;},cancel:()=>{}});
  const pending=assets.load('missing.png');const stale=image.onload;
  jobs[0]();assert.equal(await pending,null);stale();
  assert.equal(await assets.load('missing.png'),null);assert.ok(assets.missing.has('missing.png'));
});

test('successful pose preloads are cached and the inactive crew remains seated',async () => {
  const image={};let cancelled=0;
  const assets=new SceneAssets({imageFactory:()=>image,schedule:()=>1,cancel:()=>{cancelled++;}});
  const pending=assets.load('pose.png');assert.equal(assets.load('pose.png'),pending);image.onload();
  assert.equal(await pending,image);assert.equal(cancelled,1);
  const {model}=acceptedEVA();const state=model.snapshot;state.workId='rest';state.health=10;
  assert.equal(sceneState(state).crewIdle,'seated');
});

test('game-authorized emergency cleaning receives an EVA plan without repeating its health charge',() => {
  const model=game();const state=model.snapshot;
  Object.assign(state,{sol:4,currentEventId:'E07',energy:0,health:90,weather:'sandstorm',dusty:true});model.restore(state);
  model.chooseEmergencyClean('force_clean');
  const before=model.snapshot;const plan=before.visualAction;
  assert.equal(plan.mode,'eva');assert.equal(plan.cost.condition,20);assert.equal(plan.cost.energy,0);
  const {director}=clock();director.present(plan);director.skip();
  assert.deepEqual(model.snapshot,before);assert.equal(model.snapshot.health,70);
});


test('the accepted visual record is retained before asynchronous scene refresh for browser recovery',() => {
  const {plan}=acceptedEVA();let presented=null;
  const view={reducedMotion:true,movement:{present:value=>{presented=value;}}};
  GameView.prototype.presentActivity.call(view,plan);
  assert.equal(view.lastVisualAction,plan);assert.equal(presented,plan);
});


test('room crew layers receive motion and respect reduced motion without moving their feet',() => {
  const previous=globalThis.document;globalThis.document={hidden:false};
  try {
    const animations=[];
    const make=()=>({style:{},animate:(frames,options)=>{const animation={frames,options,playState:'running',cancel(){this.playState='idle';},pause(){this.playState='paused';},play(){this.playState='running';}};animations.push(animation);return animation;}});
    const actors=['astronaut-a','astronaut-b'].map(id=>{const image=make(),node=make();node.querySelector=()=>image;return {id,image,node};});
    const root={querySelector:selector=>actors.find(actor=>selector.includes(actor.id))?.node};
    const crew=new CrewMotion(root);crew.sync(false);
    assert.equal(animations.length,2);assert.equal(actors[0].image.style.transformOrigin,'60% 92.5%');
    crew.react({plan:{actorId:'astronaut-a'},key:'working',skipped:false});assert.equal(animations.length,3);
    crew.sync(true);assert.ok(animations.every(animation=>animation.playState==='idle'));
    crew.dispose();assert.equal(crew.actors.size,0);
  } finally {globalThis.document=previous;}
});
