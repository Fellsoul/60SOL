import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { I18n } from '../src/services/I18n.js';
import { ACTIONS, LIGHT_ACTIONS, unavailableReason } from '../src/models/ActionRules.js';
import { GameModel } from '../src/models/GameModel.js';
import { SaveRepository } from '../src/repositories/SaveRepository.js';
import { finishSol } from '../src/models/TurnEngine.js';

const readJson = async path => JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const languages = await readJson('../locales/languages.json');
const catalogs = Object.fromEntries(await Promise.all(languages.map(async ({code}) =>
  [code,await readJson(`../locales/${code}.json`)])));
const events = await readJson('../data/events.json');
const tools = await readJson('../data/tools.json');
const semanticKey = /^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;

test('所有语言使用相同的英文语义 key，译文保持为字符串',() => {
  assert.deepEqual(Object.keys(catalogs.en).sort(),Object.keys(catalogs['zh-CN']).sort());
  for (const catalog of Object.values(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(),Object.keys(catalogs.en).sort());
    for (const [key,value] of Object.entries(catalog)) {
      assert.match(key,semanticKey); assert.equal(typeof value,'string'); assert.ok(value.length);
      assert.deepEqual(value.match(/\{[a-zA-Z]+\}/g) ?? [],catalogs.en[key].match(/\{[a-zA-Z]+\}/g) ?? [],`Placeholder changed: ${key}`);
    }
  }
});

test('registered languages load, persist and switch without changing mission saves',async t => {
  const entries = new Map([['outpost.language','hi'],['mission-save','preserve this save']]);
  t.mock.method(globalThis,'fetch',async path => ({ok:true,json:() => readJson(`../${path}`)}));
  for (const [key,value] of Object.entries({document:{documentElement:{lang:''}},localStorage:{getItem:key => entries.get(key),setItem:(key,value) => entries.set(key,value)}})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(() => previous ? Object.defineProperty(globalThis,key,previous) : delete globalThis[key]);
  }
  const translator = new I18n();await translator.init();
  assert.equal(translator.language,'hi');
  assert.equal(new Set(languages.map(({code}) => code)).size,languages.length);
  for (const {code} of languages) {
    translator.setLanguage(code);
    assert.equal(document.documentElement.lang,code);
    assert.equal(document.documentElement.dir,code === 'ar' ? 'rtl' : 'ltr');
    assert.equal(entries.get('outpost.language'),code);
    assert.equal(translator.t('menu.new'),catalogs[code]['menu.new']);
    assert.equal(translator.t('我们照料了作物，种植槽中的叶片舒展开来。'),catalogs[code]['action.grow.summary']);
  }
  translator.setLanguage('ar');assert.equal(document.documentElement.dir,'rtl');
  const reloaded = new I18n();await reloaded.init();
  assert.equal(reloaded.language,'ar');assert.equal(document.documentElement.dir,'rtl');
  translator.setLanguage('unsupported');assert.equal(translator.language,'en');assert.equal(document.documentElement.dir,'ltr');
  assert.equal(entries.get('mission-save'),'preserve this save');assert.equal(entries.size,2);
});

test('translated instructions preserve numeric costs, yields and limits',() => {
  for (const [key,english] of Object.entries(catalogs.en)) {
    if (!/(?:\.description|\.narrative)$|^sampling\./.test(key)) continue;
    for (const {code} of languages.filter(({code}) => !['en','zh-CN','zh-HK'].includes(code))) {
      const numbers = catalogs[code][key].match(/\d+/g) ?? [];
      for (const number of english.match(/\d+/g) ?? []) {
        assert.ok(numbers.includes(number),`${code}: ${key} lost ${number}`);
      }
    }
  }
});

test('intro, credits and resource logs have complete localized copy',async () => {
  const intro = await readJson('../assets/scene/init_game/intro.json');
  const credits = await readJson('../assets/menu/credits.json');
  const logs = await readJson('../data/resource_log.json');
  for (const {code} of languages) {
    if (code !== 'en') {
      assert.equal(intro.translations[code].lines.length,intro.lines.length);
      assert.ok(intro.translations[code].lines.every(line => typeof line === 'string' && line.length));
      intro.lines.forEach((line,index) => {
        const translated = intro.translations[code].lines[index].match(/\d+/g) ?? [];
        for (const number of line.match(/\d+/g) ?? []) assert.ok(translated.includes(number),`${code}: intro lost ${number}`);
      });
      assert.equal(credits.translations[code].title,catalogs[code]['menu.credits']);
      assert.equal(credits.translations[code].sections.length,credits.sections.length);
    }
    for (const source of Object.values(logs.sources)) {
      assert.equal(source.descriptions[code].length,source.descriptions.en.length);
      assert.ok(source.descriptions[code].every(line => typeof line === 'string' && line.length));
    }
    for (const resource of Object.values(logs.resources)) assert.ok(resource[code]?.length);
  }
});

test('事件、选项、工具、工作和静态界面的翻译引用均可解析',async () => {
  const references = [
    ...events.flatMap(event => [event.title,event.text,event.summaryLine,event.endingSummary,...event.choices.flatMap(choice => [choice.label,choice.description,choice.summaryLine])]),
    ...tools.flatMap(tool => [tool.name,tool.description]),
    ...ACTIONS.flatMap(action => [action.label,action.narrative,action.summaryLine]),
    ...LIGHT_ACTIONS.flatMap(action => [action.label,action.narrative,action.summaryLine]),
  ];
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  references.push(...Array.from(html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g),match => match[1]));
  for (const key of references) {
    assert.match(key,semanticKey);
    for (const catalog of Object.values(catalogs)) assert.ok(Object.hasOwn(catalog,key),`Missing translation: ${key}`);
  }
});

test('新游戏的简报和规则提示保存英文 key',() => {
  const game = new GameModel({events:events.filter(event => !event.dailySol),tools}); game.start(['toolkit','battery']);
  assert.equal(unavailableReason(game.snapshot,ACTIONS[0]),'');
  game.choose('grow'); game.useBattery(); game.nextSol();
  for (const key of game.snapshot.previousDaySummary) assert.ok(Object.hasOwn(catalogs.en,key));
  const state = game.snapshot;
  Object.assign(state,{food:0,lifeSupportPaid:false,weather:'sandstorm',pendingData:1});
  finishSol(state);
  for (const key of state.previousDaySummary) assert.ok(Object.hasOwn(catalogs.en,key));
  assert.throws(() => game.work('unknown'),{message:'error.unknownWork'});
});

test('旧存档的中文简报仍可翻译，未知旧文本保留且不重写存档',() => {
  const game = new GameModel({events:events.filter(event => !event.dailySol),tools}); game.start(['toolkit','battery']); game.choose('grow'); game.nextSol();
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
