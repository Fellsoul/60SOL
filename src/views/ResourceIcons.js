import { escapeHtml } from './dom.js';
import { i18n } from '../services/I18n.js';
import { textCharacters } from './TextSegments.js';

const image = (name,extra='') => `<span class="resource-icon resource-icon--${name} ${extra}" aria-hidden="true"><img class="resource-art" src="assets/ui/${name}.png" alt=""></span>`;
export function resourceAmount(resource,amount) {
  const food=resource === 'food', name=food ? 'drumstick' : 'flask';
  const label=i18n.t(food ? 'resources.food' : 'resources.research');
  const value=Number.isFinite(amount) ? Math.max(0,Math.abs(amount)) : 0;
  const icons=`${image(name,value ? '' : 'resource-dim')}<span aria-hidden="true">× ${food ? value/4 : value}</span>`;
  return `<span class="resource-amount" role="img" title="${escapeHtml(`${label} ${value}`)}" aria-label="${escapeHtml(`${label} ${value}`)}" data-resource="${resource}" data-amount="${value}">${icons}</span>`;
}

// Only explicit numeric resource quantities become icons; narrative words remain text.
const foodUnit='(?:食物|food|F\\b|(?:de\\s+)?comida\\b|Nahrung\\b|vivres\\b|भोजन|їжі|їжа|(?:من\\s+)?الطعام)';
const researchUnit='(?:本地科研数据|本地数据|科研数据|研究点|研究成果|研究记录|本機科研資料|本機資料|科研資料|研究點|研究記錄|研究(?!次数|次數)|(?:traceable\\s+)?local(?:\\s+research)?\\s+data|research\\s+(?:data|points?|records?)|data|D\\b|datos(?:\\s+locales)?\\b|(?:lokale(?:n)?\\s+)?(?:Forschungsdaten|Daten)\\b|données(?:\\s+locales)?\\b|स्थानीय(?:\\s+शोध)?\\s+डेटा|शोध\\s+डेटा|डेटा|(?:місцев(?:их|і)|локальн(?:их|і))\\s+дан(?:их|і)|даних|(?:من\\s+)?(?:البيانات|بيانات)(?:\\s+البحث)?(?:\\s+المحلية)?)';
const resourcePattern=new RegExp(`([+−-]?\\d+)\\s*(?:点\\s*|點\\s*)?(${foodUnit}|${researchUnit})|(食料|ローカル(?:研究)?データ|研究データ|データ)([+−-]?\\d+)`,'gi');
export function resourceTokens(value) {
  const text=String(value),tokens=[];let end=0;
  for (const match of text.matchAll(resourcePattern)) {
    tokens.push(...textCharacters(text.slice(end,match.index)).map(escapeHtml));
    const number=match[1] ?? match[4],unit=match[2] ?? match[3];
    const food=/食物|food|^F$|comida|Nahrung|vivres|भोजन|їж[іа]|食料|الطعام/i.test(unit);
    const sign=/^[+−-]/.test(number) ? number[0] : '';
    tokens.push(sign+resourceAmount(food?'food':'localData',Math.abs(Number(number.replace('−','-')))));
    end=match.index+match[0].length;
  }
  tokens.push(...textCharacters(text.slice(end)).map(escapeHtml));
  return tokens;
}
export const resourceText=value=>resourceTokens(value).join('');

export function resourceInventory(state) {
  return `<section class="resource-inventory" aria-label="${escapeHtml(i18n.t('resources.inventory'))}"><span>${resourceAmount('food',state.food)}</span><span>${resourceAmount('localData',state.localData)}</span></section>`;
}
