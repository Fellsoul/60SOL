const protectedState = () => ({location:'desk',outfit:'indoor',suitReady:false,insideProtected:true,repressurized:true,innerClosed:true,outerClosed:true,outsideVisible:false,validExteriorZone:false});

export function safeVisualState(state) {
  if (state.outsideVisible && (!state.suitReady || state.outfit!=='eva' || !state.validExteriorZone)) return false;
  if (!state.outerClosed && (!state.innerClosed || !state.suitReady)) return false;
  if (!state.innerClosed && (!state.outerClosed || !state.repressurized)) return false;
  if (state.outfit==='indoor' && (!state.insideProtected || !state.repressurized || !state.outerClosed)) return false;
  return true;
}

export function movementSteps(plan) {
  const base = protectedState();
  const step = (at,key,patch={}) => ({at,key,state:{...base,...patch}});
  if (plan.mode!=='eva') return [step(0,'accepted'),step(400,'stationCut'),step(900,'working'),step(1800,'complete')];
  const suited = {...base,location:'offscreen-airlock',outfit:'eva',suitReady:true};
  const eva = (at,key,patch={}) => ({at,key,state:{...suited,...patch}});
  return [
    step(0,'foregroundCut'),
    eva(500,'suitChecks'),
    eva(1100,'innerClosed'),
    eva(1600,'equalizing',{insideProtected:false,repressurized:false}),
    eva(2000,'outbound',{insideProtected:false,repressurized:false,outerClosed:false}),
    eva(2500,'outside',{location:'offscreen-exterior',insideProtected:false,repressurized:false}),
    eva(3100,'outerClosed',{insideProtected:false,repressurized:false}),
    eva(3600,'repressurizing'),
    eva(4000,'dustControl'),
    step(4400,'doffing'),
    step(4800,'complete'),
  ];
}

export class MovementDirector {
  constructor({onFrame,onComplete=()=>{},now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}) {
    this.onFrame=onFrame;this.onComplete=onComplete;
    this.now=now;this.schedule=schedule;this.cancel=cancel;
    this.version=0;this.seen=new Set();this.active=null;this.timer=null;
  }
  present(input,{reducedMotion=false,hidden=false}={}) {
    if (this.seen.has(input.id)) return false;
    this.skip();
    const plan=structuredClone(input);
    Object.freeze(plan.cost);Object.freeze(plan.terminal);Object.freeze(plan);
    this.seen.add(plan.id);
    if (this.seen.size>64) this.seen.delete(this.seen.values().next().value);
    const version=++this.version;
    this.active={plan,steps:movementSteps(plan),index:0,started:this.now(),version};
    if (reducedMotion || hidden) this.skip();
    else this.advance(version);
    return true;
  }
  emit(active,step,skipped) {
    if (!safeVisualState(step.state)) throw new Error('Unsafe movement checkpoint');
    this.onFrame({plan:active.plan,key:step.key,state:{...step.state},skipped});
  }
  advance(version) {
    const active=this.active;
    if (!active || active.version!==version) return;
    const elapsed=Math.max(0,this.now()-active.started);
    // A resumed tab jumps to the safe terminal state instead of sweeping a path.
    if (elapsed>active.steps.at(-1).at+500) { this.skip();return; }
    while (active.index<active.steps.length && active.steps[active.index].at<=elapsed) {
      this.emit(active,active.steps[active.index++],false);
      if (this.active!==active) return;
    }
    if (active.index===active.steps.length) { this.finish(active);return; }
    this.timer=this.schedule(()=>this.advance(version),Math.max(0,active.steps[active.index].at-elapsed));
  }
  finish(active) {
    if (this.active!==active) return;
    if (this.timer!==null) this.cancel(this.timer);
    this.timer=null;this.active=null;
    this.onComplete(active.plan);
  }
  skip() {
    const active=this.active;
    if (!active) return;
    if (this.timer!==null) this.cancel(this.timer);
    this.timer=null;
    while (this.active===active && active.index<active.steps.length) this.emit(active,active.steps[active.index++],true);
    this.finish(active);
  }
  restore(plan) {
    this.clear();
    if (!plan) return;
    this.seen.add(plan.id);
    const active={plan:structuredClone(plan)};
    this.emit(active,{key:'complete',state:protectedState()},true);
  }
  clear() {
    this.skip();this.version++;
    this.active=null;this.seen.clear();
  }
  dispose() { this.clear(); }
}
