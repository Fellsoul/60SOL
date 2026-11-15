import test from 'node:test';
import assert from 'node:assert/strict';
import { Typewriter } from '../src/views/Typewriter.js';
function clock(run) {
 const set=globalThis.setTimeout,clear=globalThis.clearTimeout;let serial=0;const timers=new Map();
 globalThis.setTimeout=fn=>{timers.set(++serial,fn);return serial;};globalThis.clearTimeout=id=>timers.delete(id);
 const tick=()=>{const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1]();}};
 try{run({tick,timers});}finally{globalThis.setTimeout=set;globalThis.clearTimeout=clear;}
}
const node=()=>({innerHTML:'',textContent:'',classList:{add(){},remove(){}}});
test('resource deltas wait for their own line, and later lines remain hidden',()=>clock(({tick})=>{
 const writer=new Typewriter(),a=node(),b=node(),first={hidden:false},second={hidden:false};
 writer.play([{node:a,text:'First line',after:[first]},{node:b,text:'Next line',after:[second]}]);
 assert.equal(first.hidden,true);assert.equal(second.hidden,true);
 for(let i=0;i<4;i++)tick();assert.equal(first.hidden,false);assert.equal(second.hidden,true);
 writer.skip();assert.equal(second.hidden,false);assert.equal(b.innerHTML,'Next line');
}));
test('inline quantities appear as complete icon units without exposing partial resource words',()=>clock(({tick})=>{
 const writer=new Typewriter(),line=node();writer.play([{node:line,text:'AB 12 local data CD'}]);
 assert.equal(line.innerHTML,'AB');tick();
 assert.ok(line.innerHTML.includes('flask.png'));assert.ok(line.innerHTML.includes('× 12'));
 assert.ok(!line.innerHTML.includes('local data'));writer.cancel();
}));
test('reduced motion reveals all resources; restarting hides them again and cancelling stops future reveals',()=>clock(({tick,timers})=>{
 const writer=new Typewriter(),line=node(),after={hidden:true};let completed=0;
 const jobs=[{node:line,text:'Long line of text',after:[after]}];
 writer.play(jobs,{reducedMotion:true,onComplete:()=>completed++});assert.equal(after.hidden,false);assert.equal(completed,1);
 writer.play(jobs);assert.equal(after.hidden,true);writer.cancel();tick();assert.equal(after.hidden,true);assert.equal(timers.size,0);
}));
