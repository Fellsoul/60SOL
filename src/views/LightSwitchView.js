import { i18n } from '../services/I18n.js';

export class LightSwitchView {
  constructor() {
    this.toggle = document.createElement('button');
    this.toggle.id = 'light-switch'; this.toggle.type = 'button';
    this.toggle.hidden = true; this.toggle.disabled = true;
    // The button and its artwork share one small tabletop footprint beside the built-in control panel.
    this.toggle.innerHTML = `<svg viewBox="0 0 52 82" preserveAspectRatio="none" aria-hidden="true"><rect class="switch-plate" x="2" y="2" width="48" height="78" rx="5" fill="#aaa58f" stroke="#393e36" stroke-width="3"/><circle cx="26" cy="9" r="2" fill="#51564b"/><circle cx="26" cy="73" r="2" fill="#51564b"/><rect x="12" y="20" width="28" height="42" rx="3" fill="#383d36"/><path class="switch-rocker" d="M15 23h22v35H15z" fill="#dad2b6" stroke="#636654" stroke-width="2"/><path class="switch-mark" d="M26 29v9" stroke="#43563a" stroke-width="3"/><circle class="switch-indicator" cx="26" cy="48" r="3" fill="#a7c967"/></svg>`;
  }
  mount() { document.querySelector('#scene').append(this.toggle); }
  render(state,{busy=false}={}) {
    this.toggle.hidden = !state;
    const on = Boolean(state?.lightsOn);
    this.toggle.setAttribute('aria-pressed',String(on));
    const label = i18n.t(on ? 'action.lights_off.label' : 'action.lights_on.label');
    this.toggle.setAttribute('aria-label',label); this.toggle.title = label;
    this.toggle.disabled = busy || !state || state.phase === 'finished' || (!on && state.energy === 0);
  }
}
