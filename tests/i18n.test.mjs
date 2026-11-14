import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { I18n } from '../src/services/I18n.js';
import { ACTIONS, unavailableReason } from '../src/models/ActionRules.js';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { finishSol } from '../src/models/TurnEngine.js';

const readJson = async path => JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const catalogs = {en:await readJson('../locales/en.json'),'zh-CN':await readJson('../locales/zh-CN.json')};
const events = await readJson('../data/events.json');
const tools = await readJson('../data/tools.json');
const semanticKey = /^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;

test('所有语言使用相同的英文语义 key，译文保持为字符串',() => {
  assert.deepEqual(Object.keys(catalogs.en).sort(),Object.keys(catalogs['zh-CN']).sort());
  for (const catalog of Object.values(catalogs)) {
    for (const [key,value] of Object.entries(catalog)) {
      assert.match(key,semanticKey); assert.equal(typeof value,'string'); assert.ok(value.length);
    }
  }
});

test('事件、选项、工具、工作和静态界面的翻译引用均可解析',async () => {
  const references = [
    ...events.flatMap(event => [event.title,event.text,event.summaryLine,...event.choices.flatMap(choice => [choice.label,choice.description,choice.summaryLine])]),
    ...tools.flatMap(tool => [tool.name,tool.description]),
    ...ACTIONS.flatMap(action => [action.label,action.narrative,action.summaryLine]),
  ];
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  references.push(...Array.from(html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g),match => match[1]));
  for (const key of references) {
    assert.match(key,semanticKey);
    for (const catalog of Object.values(catalogs)) assert.ok(Object.hasOwn(catalog,key),`Missing translation: ${key}`);
  }
});

test('新游戏的简报和规则提示保存英文 key',() => {
  const game = new GameModel({events,tools}); game.start(['toolkit','battery']);
  assert.equal(unavailableReason(game.snapshot,ACTIONS[0]),'error.eventFirst');
  game.choose('grow'); game.useBattery(); game.nextSol();
  for (const key of game.snapshot.previousDaySummary) assert.ok(Object.hasOwn(catalogs.en,key));
  const state = game.snapshot;
  Object.assign(state,{food:0,lifeSupportPaid:false,weather:'sandstorm',pendingData:1});
  finishSol(state);
  for (const key of state.previousDaySummary) assert.ok(Object.hasOwn(catalogs.en,key));
  assert.throws(() => game.work('unknown'),{message:'error.unknownWork'});
});

test('旧存档的中文简报仍可翻译，未知旧文本保留且不重写存档',() => {
  const game = new GameModel({events,tools}); game.start(['toolkit','battery']); game.choose('grow'); game.nextSol();
  const legacy = game.snapshot;
  legacy.previousDaySummary = ['我们把第一天留给了温室。种植槽里出现了嫩芽。','我们照料了作物，种植槽中的叶片舒展开来。','旧存档中的自定义记录'];
  const raw = JSON.stringify(legacy);
  const storage = {getItem:() => raw}; const repo = new SaveRepository(storage,{events,tools});
  const restored = repo.load().state; assert.deepEqual(restored,legacy);
  const translator = new I18n(catalogs);
  assert.deepEqual(restored.previousDaySummary.map(line => translator.t(line)),[
    'We spent our first day in the greenhouse. Shoots appeared in the planting trays.',
    'We tended the crops. Leaves unfolded in the planting trays.',
    '旧存档中的自定义记录',
  ]);
  translator.language = 'zh-CN';
  assert.deepEqual(restored.previousDaySummary.map(line => translator.t(line)),legacy.previousDaySummary);
  assert.equal(storage.getItem(repo.key),raw);
});

test('缺少翻译时回退到英语，未知 key 保持原样',() => {
  const translator = new I18n({en:catalogs.en,'zh-CN':{}}); translator.language = 'zh-CN';
  assert.equal(translator.t('action.grow.narrative'),"Use power to tend the crops. This takes today's work.");
  assert.equal(translator.t('unknown.key'),'unknown.key'); assert.equal(translator.t('toString'),'toString');
});
