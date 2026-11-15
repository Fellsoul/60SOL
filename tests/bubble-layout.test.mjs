import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleLayout } from '../src/views/BubbleLayout.js';
const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
test('shared anchors spread nearby without overlaps or leaving the canvas',()=>{
 const items=Array.from({length:6},()=>({x:250,y:180,width:140,height:100}));
 const positions=bubbleLayout(items,800,500);assert.ok(positions.every(Boolean));
 positions.forEach((a,i)=>{assert.ok(a.x>=8&&a.y>=8&&a.x+a.width<=792&&a.y+a.height<=492);assert.ok(positions.slice(i+1).every(b=>!overlap(a,b)));});
 assert.deepEqual(bubbleLayout(items,800,500),positions);
});
test('crowded small scenes queue excess bubbles and free space admits the next bubble',()=>{
 const items=Array.from({length:6},()=>({x:30,y:30,width:140,height:100}));
 const positions=bubbleLayout(items,200,150);assert.equal(positions.filter(Boolean).length,1);
 assert.ok(bubbleLayout(items.slice(1),200,150)[0]);
 assert.equal(bubbleLayout([{x:0,y:0,width:500,height:500}],200,150)[0],null);
});
