import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceTokens,resourceText } from '../src/views/ResourceIcons.js';
import { textCharacters } from '../src/views/TextSegments.js';

test('localized resource quantities retain icons and amounts in every new language',() => {
  for (const copy of ['32 de comida y 6 datos locales','32 Nahrung und 6 lokale Daten','32 vivres et 6 données locales','32 भोजन और 6 स्थानीय डेटा','食料32とローカルデータ6','32 їжі та 6 місцевих даних','32 їжі та 6 локальних даних','32 Nahrung und 6 Daten','32 食物與 6 點本機科研資料','32 من الطعام و6 من البيانات المحلية']) {
    const html = resourceText(copy);
    assert.ok(html.includes('drumstick.png'),copy);
    assert.ok(html.includes('data-amount="32"'),copy);
    assert.ok(html.includes('flask.png'),copy);
    assert.ok(html.includes('data-amount="6"'),copy);
    assert.equal((html.match(/data-resource=/g) ?? []).length,2,copy);
  }
  for (const copy of ['Sol 14','3 échantillons','1 Ersatzteil','1 नमूना','試料1個','2 зразки','研究次數 2','3 عينات','1 قطعة غيار']) {
    assert.equal(resourceText(copy),copy);
  }
});

test('animated text keeps Hindi conjuncts, Japanese accents and combining marks intact',() => {
  assert.deepEqual(textCharacters('क्षि'),['क्षि']);
  assert.deepEqual(textCharacters('か\u3099'),['か\u3099']);
  assert.deepEqual(textCharacters('e\u0301'),['e\u0301']);
  assert.deepEqual(textCharacters('بِ'),['بِ']);
  const tokens = resourceTokens('क्षि 20 स्थानीय डेटा');
  assert.equal(tokens[0],'क्षि');
  assert.equal(tokens.length,3);
  assert.ok(tokens[2].includes('data-amount="20"'));
});
