import { i18n } from '../services/I18n.js';
import { LIMITS } from '../models/state.js';
import { robotSampleReason } from '../models/ExpeditionRules.js';

export const toolkitIcon = '<svg class="toolkit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3a6 6 0 0 0-7 8L2 16a3 3 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-3-3 4-4Z" fill="currentColor"/></svg>';

export class SceneToolsView {
  constructor(root) {
    this.root = root;
    this.node = document.createElement('div');
    this.node.className = 'scene-tools';
    this.buttons = new Map();
    for (const [id, action, art] of [
      ['toolkit', 'toolkit', toolkitIcon],
      ['robot', 'robot-sample', '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3v6M12 32v4M28 32v4" stroke="currentColor" stroke-width="3"/><rect x="5" y="10" width="30" height="23" rx="5" fill="#b9b9a3" stroke="currentColor" stroke-width="2"/><circle cx="13" cy="20" r="3" fill="currentColor"/><circle cx="27" cy="20" r="3" fill="currentColor"/><path d="M14 27h12" stroke="currentColor" stroke-width="2"/></svg>'],
      ['battery', 'battery', '<img src="assets/ui/battery.png" alt="">']
    ]) {
      const button = document.createElement('span');
      button.className = 'scene-tool-indicator';
      button.dataset.tool = id;
      button.setAttribute('role','img');
      button.innerHTML = art;
      this.node.append(button); this.buttons.set(id,button);
    }
    this.repair = document.createElement('div');
    this.repair.className = 'scene-repair-highlight'; this.repair.hidden = true;
    root.append(this.node,this.repair);
  }

  render(state,event,{initial=false,morning=false}={}) {
    this.node.hidden = !state || Boolean(state.outcome);
    if (!state) { this.lastState = null; return; }
    for (const [id,button] of this.buttons) {
      button.hidden = !Object.hasOwn(state.tools,id);
      const reason = id === 'robot' ? robotSampleReason(state,event)
        : id === 'battery' ? state.tools.battery !== 'ready' ? 'error.noBattery'
          : state.energy >= LIMITS.energy ? 'error.batteryFull' : ''
        : state.tools.toolkit !== 'ready' ? 'error.toolUnavailable' : '';
      button.dataset.available = String(!reason);
      const label = `${i18n.t(`tool.${id}.name`)}: ${i18n.t(reason || `tool.${id}.description`)}`;
      button.title = label; button.setAttribute('aria-label',label);
    }
    // Show feedback only for a new committed repair, never on save restoration.
    const start = this.lastState?.sol === state.sol ? this.lastState.resourceLog?.length ?? 0 : 0;
    if (this.lastState && !initial && !morning) {
      const repairs = { 'work.repair':[32,46], 'event.E02.repair':[32,46],
        'event.E04.calibrate':[88,49], 'event.E07.repair':[47,13.5], 'event.E09.clear':[88,49] };
      const source = (state.resourceLog ?? []).slice(start).find(entry => repairs[entry.source]);
      if (source) {
        const [x,y] = repairs[source.source];
        this.repair.style.left = `${x}%`; this.repair.style.top = `${y}%`;
        this.repair.hidden = false;
        this.repairAnimation?.cancel();
        this.repairAnimation = this.repair.animate([
          {opacity:0,transform:'translate(-50%,-50%) scale(.8)'},
          {opacity:1,offset:.25,transform:'translate(-50%,-50%) scale(1)'},
          {opacity:0,transform:'translate(-50%,-50%) scale(1.2)'}
        ],{duration:document.body.classList.contains('reduced-motion') ? 0 : 1200});
        this.repairAnimation.onfinish = () => { this.repair.hidden = true; };
      }
    }
    this.lastState = state;
  }
}
