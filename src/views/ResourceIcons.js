import { escapeHtml } from './dom.js';
import { i18n } from '../services/I18n.js';

const image = (name,extra='') => `<span class="resource-icon resource-icon--${name} ${extra}" aria-hidden="true"><img class="resource-art" src="assets/ui/${name}.png" alt=""></span>`;
export function resourceAmount(resource,amount) {
  const food=resource === 'food', name=food ? 'drumstick' : 'flask';
  const label=i18n.t(food ? 'resources.food' : 'resources.research');
  const value=Number.isFinite(amount) ? Math.max(0,Math.abs(amount)) : 0;
  const icons=`${image(name,value ? '' : 'resource-dim')}<span aria-hidden="true">× ${food ? value/4 : value}</span>`;
  return `<span class="resource-amount" role="img" title="${escapeHtml(`${label} ${value}`)}" aria-label="${escapeHtml(`${label} ${value}`)}" data-resource="${resource}" data-amount="${value}">${icons}</span>`;
}

// Only explicit numeric resource quantities become icons; narrative words remain text.
const foodUnit='(?:食物|food|F\\b)';
const researchUnit='(?:本地科研数据|本地数据|科研数据|研究点|研究成果|研究记录|研究(?!次数)|(?:traceable\\s+)?local(?:\\s+research)?\\s+data|research\\s+(?:data|points?|records?)|data|D\\b)';
const resourcePattern=new RegExp(`([+−-]?\\d+)\\s*(?:点\\s*)?(${foodUnit}|${researchUnit})`,'gi');
export function resourceTokens(value) {
  const text=String(value),tokens=[];let end=0;
  for (const match of text.matchAll(resourcePattern)) {
    tokens.push(...[...text.slice(end,match.index)].map(escapeHtml));
    const food=/食物|food|^F$/i.test(match[2]);
    const sign=/^[+−-]/.test(match[1]) ? match[1][0] : '';
    tokens.push(sign+resourceAmount(food?'food':'localData',Math.abs(Number(match[1].replace('−','-')))));
    end=match.index+match[0].length;
  }
  tokens.push(...[...text.slice(end)].map(escapeHtml));
  return tokens;
}
export const resourceText=value=>resourceTokens(value).join('');

export function resourceInventory(state) {
  return `<section class="resource-inventory" aria-label="${escapeHtml(i18n.t('resources.inventory'))}"><span>${resourceAmount('food',state.food)}</span><span>${resourceAmount('localData',state.localData)}</span></section>`;
}
