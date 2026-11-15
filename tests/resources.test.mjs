import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resourceAmount, resourceText } from '../src/views/ResourceIcons.js';
import { GameModel } from '../src/models/GameModel.js';
import { finishSol } from '../src/models/TurnEngine.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { i18n } from '../src/services/I18n.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const content={events:await read('../data/events.json'),tools:await read('../data/tools.json')};
i18n.setCatalogs({en:await read('../locales/en.json'),'zh-CN':await read('../locales/zh-CN.json')});
const game=()=>{const model=new GameModel(content);model.start(['toolkit','battery']);return model;};

test('one drumstick uses a multiplier in four-food units; one flask uses a multiplier in single research points',()=>{
  for(const food of [0,1,2,3,4,7,8,12,80,128]) {
    const html=resourceAmount('food',food);
    assert.equal((html.match(/assets\/ui\/drumstick.png/g)??[]).length,1);
    assert.ok(html.includes(`× ${food/4}</span>`));
    assert.ok(html.includes(`data-amount="${food}"`));
  }
  for(const resource of ['localData','pendingData','sentData']) for(const points of [0,1,6,12,60,10000]) {
    const html=resourceAmount(resource,points);
    assert.equal((html.match(/assets\/ui\/flask.png/g)??[]).length,1);
    assert.ok(html.includes(`× ${points}</span>`));
  }
  assert.ok(resourceAmount('food',0).includes('resource-dim'));
  assert.ok(resourceAmount('localData',10000).length<1000);
  assert.ok(resourceAmount('food',1e50).length<1000);
});

test('resource prompts render bilingual numeric units as icons, escaping unrelated saved text',()=>{
  for(const text of ['Gain 3 food and 6 local data.','获得 3 食物和 6 点本地科研数据。','+3 F, +6 D']) {
    const html=resourceText(text);assert.ok(html.includes('× 0.75</span>'));assert.ok(html.includes('data-amount="6"'));assert.ok(html.includes('flask.png'));
  }
  for(const narrative of ['成员们从库存中取用了今日的食物。','我们将研究记录发送给地球。','The crew used food from storage for their daily meals.','Research uses left: 2']) {
    assert.equal(resourceText(narrative),narrative);
  }
  assert.ok(resourceText('<script>alert(1)</script>').startsWith('&lt;script&gt;'));
  assert.ok(!resourceText('研究次数 2，SOL 14').includes('flask.png'));
});

test('two crew consume eight food even during an expedition; exact supply is sufficient and shortage never goes negative',()=>{
  assert.equal(game().snapshot.food,80);
  for(const food of [0,3,7,8,9]) {
    const state=game().snapshot;Object.assign(state,{food,lightsOn:false});
    state.crew['astronaut-a']={departSol:1,returnSol:2,fatigue:0};
    finishSol(state);assert.equal(state.food,Math.max(0,food-8));assert.equal(state.health,food<8?88:100);
    assert.equal(state.previousResourceLog.find(e=>e.source==='meals')?.changes.food??0,(-Math.min(8,food)||0));
  }
});

test('legacy food, yield and resource histories scale once without rewriting the saved record',()=>{
  const state=game().snapshot;state.version=4;state.food=3;state.dailySystems.harvestFood=6;
  state.resourceLog=[{source:'meals',variant:0,fallback:'',changes:{food:-2,'systems.harvestFood':-2}}];
  let raw=JSON.stringify(state);const original=raw;
  const repository=new SaveRepository({getItem:()=>raw,setItem:(_,value)=>{raw=value;}},content);
  const first=repository.load().state;assert.equal(raw,original);assert.equal(first.food,12);assert.equal(first.dailySystems.harvestFood,24);assert.equal(first.resourceLog[0].changes.food,-8);
  assert.equal(first.resourceLog[0].changes['systems.harvestFood'],-8);
  assert.equal(first.version,5);repository.save(first,repository.key);assert.deepEqual(repository.load().state,first);
});
