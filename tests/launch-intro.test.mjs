import test from 'node:test';
import assert from 'node:assert/strict';
import { LaunchIntroView } from '../src/views/LaunchIntroView.js';

function fixture(t,overrides = {}) {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  t.mock.method(Math,'random',() => .5);
  const updates = [], fades = [];
  const classes = () => ({values:new Set(),add(value){this.values.add(value);},remove(value){this.values.delete(value);}});
  const node = name => ({
    hidden:true,style:{setProperty(){}},classList:classes(),listeners:{},
    addEventListener(event,fn){this.listeners[event]=fn;},focus(){},
    set textContent(value){this.text=value;updates.push({name,value,at:Date.now()});},
    get textContent(){return this.text ?? '';},
    set src(value){this.source=value;queueMicrotask(() => this.onload?.());},
    removeAttribute(){this.source=null;},
    animate(frames,{duration}) {
      fades.push({name,frames,at:Date.now(),duration});
      let reject;
      const finished = new Promise((resolve,fail) => { reject=fail;this.timer=setTimeout(resolve,duration); });
      const timer = this.timer;
      return {finished,cancel(){clearTimeout(timer);reject(new Error('cancelled'));}};
    }
  });
  const nodes = Object.fromEntries(['background','rocket','camera','text','announcement','skip'].map(name => [`.intro-${name}`,node(name)]));
  const root = node('root');root.querySelector = selector => nodes[selector];
  const previous = Object.fromEntries(['document','window','innerWidth','innerHeight'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  globalThis.document = {querySelector:() => root,body:{classList:classes()}};
  globalThis.window = {addEventListener(){}};
  globalThis.innerWidth = 1280;globalThis.innerHeight = 900;
  const intro = new LaunchIntroView({lines:['AAA','BBBBBB','CCCCCCCCC'],scrollMs:11000,typingCharMs:50,typingVariation:.35,typingPauseChance:.12,typingPauseMs:240,lineHoldMs:3000,lineFadeMs:400,...overrides});
  const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
  const advance = async ms => {
    await flush();
    while (ms > 0) { t.mock.timers.tick(1);ms--;await flush(); }
  };
  t.after(() => {
    intro.stop();
    for (const [key,descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  });
  return {intro,root,nodes,updates,fades,advance,flush};
}

test('intro offers skip as playback starts and each completed line holds for three seconds',async t => {
  const {intro,root,updates,fades,advance} = fixture(t);
  intro.start();
  const started = Date.now();
  let finished = false;const playback = intro.finishSetup().then(() => { finished=true; });
  assert.equal(intro.skipButton.hidden,false);
  await advance(12000);await playback;
  assert.equal(finished,true);
  assert.equal(root.classList.values.has('intro-cruising'),true);
  const fullLines = ['AAA','BBBBBB','CCCCCCCCC'].map(value => updates.find(update => update.name === 'text' && update.value === value));
  assert.ok(fullLines.every(update => update.at >= started));
  const textFades = fades.filter(fade => fade.name === 'text');
  assert.equal(textFades.length,3);
  fullLines.forEach((line,index) => {
    assert.ok(textFades[index].at-line.at >= 3000);
    assert.ok(textFades[index].at-line.at < 3020);
    const lineStart = index ? textFades[index-1].at+400 : started;
    const typingMs = line.at-lineStart;
    assert.equal(typingMs,line.value.length*50,'line length controls typing duration at the configured base pace');
  });
  assert.equal(intro.text.textContent,'');
});

test('typing reveals one character at a time with varied speed and a pause after punctuation',async t => {
  const {intro,updates,advance,flush} = fixture(t,{lines:['AB, C'],typingCharMs:100});
  const random = [0,1,.5,.5,0,.5,.5];
  t.mock.method(Math,'random',() => random.shift() ?? .5);
  intro.start();const playback = intro.finishSetup();
  await advance(1000);
  const revealed = updates.filter(update => update.name === 'text' && update.value);
  // The final full-text assignment may repeat the last value, without another keystroke.
  const characters = revealed.filter((update,index) => !index || update.value !== revealed[index-1].value);
  assert.deepEqual(characters.map(update => update.value),['A','AB','AB,','AB, ','AB, C']);
  const intervals = characters.map((update,index) => update.at-(characters[index-1]?.at ?? 0));
  assert.ok(intervals[0] >= 65 && intervals[0] <= 66);
  assert.equal(intervals[1],135);
  assert.ok(intervals[3] > intervals[2]+100,'a comma adds a short pause before the next character');
  intro.skip();await flush();await playback;
});

test('an occasional word pause can be skipped without revealing stale characters',async t => {
  const {intro,advance,flush} = fixture(t,{lines:['A B'],typingCharMs:100});
  t.mock.method(Math,'random',() => 0);
  intro.start();const playback = intro.finishSetup();
  await advance(150);assert.equal(intro.text.textContent,'A ');
  await advance(100);assert.equal(intro.text.textContent,'A ');
  intro.skip();await flush();await playback;
  await advance(1000);assert.equal(intro.text.textContent,'');assert.equal(intro.pending.size,0);
});

test('intro waits for the background even when all introduction text has finished',async t => {
  const {intro,advance} = fixture(t,{scrollMs:20000});
  intro.start();let finished = false;
  const playback = intro.finishSetup().then(() => { finished=true; });
  await advance(12000);
  assert.equal(intro.text.textContent,'');assert.equal(finished,false);
  await advance(8000);await playback;
  assert.equal(finished,true);
});

for (const [phase,elapsed] of [['typing',50],['hold',600],['fade',3300]]) {
  test(`skip during ${phase} settles playback immediately and a new intro starts cleanly`,async t => {
    const {intro,advance,flush} = fixture(t);
    intro.start();const playback = intro.finishSetup();
    await advance(elapsed);intro.skip();await flush();await playback;
    assert.equal(intro.text.textContent,'');assert.equal(intro.pending.size,0);assert.equal(intro.animations.size,0);
    intro.stop();intro.start();await advance(500);
    assert.equal(intro.active,true);assert.equal(intro.textStarted,false);
    assert.equal(intro.text.textContent,'');assert.equal(intro.skipButton.hidden,true);
  });
}

test('reduced motion preserves all three reading intervals and cancellation releases an unfinished playback',async t => {
  const {intro,fades,advance,flush} = fixture(t);
  intro.start(true);let finished = false;
  const playback = intro.finishSetup().then(() => { finished=true; });
  await advance(8992);assert.equal(finished,false);
  await advance(64);await playback;assert.equal(finished,true);
  assert.equal(fades.length,0);
  intro.stop();intro.start();const cancelled = intro.finishSetup();
  await advance(80);intro.stop();await flush();await cancelled;
  assert.equal(intro.root.hidden,true);assert.equal(intro.pending.size,0);
});
