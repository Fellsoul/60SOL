import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundMusic } from '../src/views/BackgroundMusic.js';

globalThis.document={addEventListener(){},removeEventListener(){}};
function fixture() {
  let time=0,id=0;const timers=new Map();
  class Audio {
    constructor(){this.volume=0;this.paused=true;this.currentTime=0;this.listeners={};this.loads=0;}
    set src(value){this.url=value;this.currentTime=0;this.loads++;}
    get src(){return this.url;}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    end(){this.paused=true;this.listeners.ended();}
  }
  const music=new BackgroundMusic({volume:.6,music:{menu:'menu.mp3',game:['14Sol.mp3','3Souols.mp3'],storm:'sandwanton.mp3',gapMs:2000,fadeMs:0}}, {
    audioFactory:()=>new Audio(),now:()=>time,schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),
    frame:fn=>{timers.set(++id,{fn,at:time+10});return id;},cancelFrame:id=>timers.delete(id)
  });
  const advance=ms=>{const end=time+ms;while(true){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=end;};
  return {music,advance};
}
test('menu and game fade independently; black pauses without seeking and next Sol resumes',async()=>{
  const {music,advance}=fixture();await music.setMode('menu');assert.equal(music.menu.paused,false);assert.equal(music.menu.loop,true);
  await music.setMode('game');music.game.currentTime=42;
  const fade=music.setMode('black',100);advance(50);assert.ok(music.game.volume>0&&music.game.volume<.6);advance(50);await fade;
  assert.equal(music.game.paused,true);assert.equal(music.game.currentTime,42);
  await music.setMode('game');assert.equal(music.game.currentTime,42);assert.equal(music.game.loads,1);
  await music.setMode('menu');assert.equal(music.game.paused,true);assert.equal(music.menu.volume,.6);
});
test('playlist alternates with two-second gaps; black preserves remaining gap time',async()=>{
  const {music,advance}=fixture();await music.setMode('game');music.game.end();advance(700);
  await music.setMode('black');advance(9000);assert.equal(music.game.src,'14Sol.mp3');
  await music.setMode('game');advance(1299);assert.equal(music.game.src,'14Sol.mp3');advance(1);assert.equal(music.game.src,'3Souols.mp3');
  music.game.end();advance(2000);assert.equal(music.game.src,'14Sol.mp3');assert.equal(music.game.paused,false);
});
test('rapid mode changes cancel stale fade callbacks and volume changes take effect',async()=>{
  const {music,advance}=fixture();await music.setMode('game');const fade=music.setMode('black',100);advance(20);
  await music.setMode('game',0);advance(200);await fade;assert.equal(music.game.paused,false);assert.equal(music.game.volume,.6);
  music.setVolume(.2);advance(150);assert.equal(music.game.volume,.2);music.dispose();assert.equal(music.game.paused,true);
});
test('storm and clear music preserve independent positions across blackouts and menu visits',async()=>{
  const {music,advance}=fixture();await music.setMode('game');music.game.currentTime=42;
  await music.setMode('black');await music.setMode('storm');music.storm.currentTime=17;
  assert.equal(music.game.paused,true);assert.equal(music.storm.loop,true);
  await music.setMode('black');await music.setMode('storm');assert.equal(music.storm.currentTime,17);assert.equal(music.storm.loads,1);
  await music.setMode('menu');assert.equal(music.storm.paused,true);
  await music.setMode('game');assert.equal(music.game.currentTime,42);
  music.game.end();advance(500);await music.setMode('storm');advance(5000);
  await music.setMode('game');advance(1499);assert.equal(music.game.src,'14Sol.mp3');advance(1);assert.equal(music.game.src,'3Souols.mp3');
});
