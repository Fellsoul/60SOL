import { CREW_IDS, crewAway } from '../models/ExpeditionRules.js';
import { i18n } from '../services/I18n.js';
import { escapeHtml } from './dom.js';

export function crewHead(id) {
  // Hair and face outlines follow the two seated crew portraits.
  const hair = id === 'astronaut-a'
    ? 'M19 39C12 29 18 12 29 9C37 1 56 5 63 15L70 24L63 24L67 34L61 43L59 28C51 25 44 15 35 18L25 29L23 43Z'
    : 'M17 37L13 26L18 15L26 9L35 7L40 3L46 8L55 8L65 18L69 30L63 40L59 25L49 18L39 16L27 25L23 40Z';
  return `<svg class="crew-head" viewBox="0 0 82 90" aria-hidden="true"><path d="${hair}"/><path d="M23 34L25 51Q29 65 41 67Q54 65 59 51L61 34M32 64L31 73L18 79L9 87M51 64L52 73L65 79L74 87M31 73Q41 83 52 73"/>${id === 'astronaut-b' ? '<path d="M25 38Q31 33 38 38L37 45Q30 49 26 43ZM44 38Q51 33 58 38L56 44Q49 49 45 44ZM38 39H44"/>' : '<path d="M29 39H35M47 39H53"/>'}<path d="M36 55Q41 58 46 55"/></svg>`;
}
export function crewStatuses(state,id) {
  return [`${i18n.t('crew.fatigue')} ${state.crew[id].fatigue*25}%`];
}
export class CrewStatus {
  constructor(root) { this.root=root; this.nodes=[]; }
  mount() {
    for (const id of CREW_IDS) {
      const node=document.createElement('div'); node.className=`crew-inspector ${id}`;
      node.innerHTML=`<button type="button" class="crew-hotspot" aria-describedby="status-${id}"></button><aside id="status-${id}" class="crew-status-panel" role="tooltip"></aside>`;
      this.root.append(node); this.nodes.push({id,node});
    }
  }
  render(state) {
    for (const {id,node} of this.nodes) {
      node.hidden = !state || crewAway(state,id);
      if (!state) continue;
      const label=i18n.t(`crew.${id.replaceAll('-','_')}.name`);
      node.querySelector('button').setAttribute('aria-label',`${label} · ${i18n.t('crew.status')}`);
      node.querySelector('aside').innerHTML=`<span>${escapeHtml(crewStatuses(state,id)[0])}</span>`;
    }
  }
}
