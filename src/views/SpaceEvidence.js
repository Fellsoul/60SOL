import { escapeHtml } from './dom.js';
import { i18n } from '../services/I18n.js';
import { sourceURL } from '../models/SpaceData.js';
const t=key=>escapeHtml(i18n.t(key));
export function spaceEvidence(state) {
  const snapshot=state?.missionSnapshot;if(!snapshot)return state ? `<p class="terminal-note">${t('space.offline')}</p>` : '';
  const observations=snapshot.observations.map(o=> {
    const value=o.sourceID==='donki' ? t(`space.advisory.${o.value}`) : `${Number(o.value.toFixed(3))} ${o.unit==='degC'?'°C':'min'}`;
    const time=o.timePrecision==='day'?`${o.observedAtUTC.slice(0,10)} · ${i18n.t('space.reportDate')} · Sol ${o.missionSol}`:o.observedAtUTC;
    return `<article><strong>${t('space.class.'+o.dataClass.replaceAll('-','_'))}</strong><p>${t('space.fact.'+o.sourceID.replaceAll('-','_'))} ${value}</p><small>${escapeHtml(o.organization)} · ${escapeHtml(o.dataset)}<br>${escapeHtml(time)} · ${escapeHtml(o.target)}</small><p><a href="${escapeHtml(sourceURL(o.url)||'#')}" target="_blank" rel="noopener noreferrer">${t('space.source')}</a></p></article>`;
  }).join('');
  const rules=snapshot.rules;
  return `<details class="space-evidence"><summary>${t('space.title')} · ${t('space.mode.'+snapshot.mode)}</summary><p>${t(snapshot.schemaVersion === 2 ? 'space.partialCurrent' : 'space.collectionNote')}</p>${observations}<p><strong>${t('space.simulation')}</strong> ${t('space.rules.advisory')} ${rules.advisorySols.join(', ')}: ${t('space.advisory.'+rules.advisory)}. ${t('space.rules.heating')} +${rules.heatingExtra} E (${rules.heatingSols.join(', ')}). ${t('space.rules.reply')} ${rules.replySols} Sol.</p><p>${t('space.lightDefinition')} ${t('space.compression')}</p><p>${t('space.randomBoundary')}</p></details>`;
}
export function snapshotSelector() {
  return `<label class="settings-field">${t('space.select')}<select name="snapshot"><option value="current">${t('space.mode.current')} (${t('space.fallback')})</option><option value="case-mars-impact">${t('space.case.impact')}</option><option value="case-mars-glancing">${t('space.case.glancing')}</option></select></label>`;
}
export function snapshotComparison(state) {
  if(!state?.outcome||!state.missionSnapshot)return '';
  const alternate=state.missionSnapshot.caseID==='case-mars-glancing'?'case-mars-impact':'case-mars-glancing';
  return `<section class="space-comparison"><h2>${t('space.compare')}</h2><p>${t('space.compareExplanation')}</p><table><tr><th>${t('space.case.impact')}</th><th>${t('space.case.glancing')}</th></tr><tr><td>${t('space.compareRestricted')}</td><td>${t('space.compareCaution')}</td></tr></table><p>${t('space.sameStart')}</p><button class="terminal-choice" data-action="replay" data-id="${alternate}">${t('space.replay')}</button></section>`;
}
