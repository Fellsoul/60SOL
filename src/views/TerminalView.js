import { choiceReason, eventResolved } from '../models/DailyEventRules.js';
import { escapeHtml } from './dom.js';
import { LIGHT_ACTIONS } from '../models/ActionRules.js';
import { Typewriter } from './Typewriter.js';
import { i18n } from '../services/I18n.js';
import { LIMITS } from '../models/state.js';
import { BatterySlotView } from './BatterySlotView.js';

function choice(action,id,label,description='',disabled=false) {
  label = i18n.t(label); description = i18n.t(description);
  return `<button class="terminal-choice" data-action="${action}" data-id="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}><span>${escapeHtml(label)}</span>${description ? `<small>${escapeHtml(description)}</small>` : ''}</button>`;
}

export class TerminalView {
  constructor(tools,resourceLog = {}) {
    this.resourceLog = resourceLog;
    this.tools = tools; this.dialog = document.querySelector('#terminal'); this.content = document.querySelector('#terminal-content');
    this.writer = new Typewriter(); this.animation = null;
    this.batterySlot = new BatterySlotView();
    // Start at 90% opacity; evaluate inside/outside only once the mouse actually moves.
    window.addEventListener('pointermove',event => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      const console = this.dialog.open && this.isConsole ? this.dialog : document.querySelector('#terminal-toggle');
      if (console.hidden || (this.dialog.open && !this.isConsole)) return;
      const rect = console.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      document.body.classList.toggle('console-pointer-outside',!inside);
    });
    document.documentElement.addEventListener('pointerleave',event => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') document.body.classList.add('console-pointer-outside');
    });
    this.dialog.addEventListener('cancel',event => { event.preventDefault(); void this.close(); });
    this.dialog.addEventListener('click',event => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void this.close();
    });
  }
  async open(state,event,reducedMotion,mode='game') {
    if (this.dialog.open) return;
    this.reducedMotion = reducedMotion;
    this.mode = mode;
    this.isConsole = Boolean(state) && mode === 'game';
    this.dialog.classList.toggle('is-console',this.isConsole);
    if (mode === 'settings') this.renderSettings(); else this.render(state,event);
    this.dialog.showModal(); document.querySelector('#terminal-toggle').setAttribute('aria-expanded','true');
    document.body.classList.toggle('console-open',this.isConsole);
    this.animation?.cancel();
    const frames = this.isConsole ? [{transform:'translateY(90%)'},{transform:'translateY(20%)'}] : [{transform:'translateX(-100%)'},{transform:'translateX(0)'}];
    this.animation = this.dialog.animate(frames,{duration:reducedMotion ? 0 : 560,easing:'cubic-bezier(.16,1,.3,1)'});
    document.querySelector('#terminal-close').focus({preventScroll:true});
    const skip = document.querySelector('#skip-typing'); skip.hidden = reducedMotion;
    this.writer.play(this.jobs,{reducedMotion,onComplete:() => { skip.hidden = true; }});
    // showModal can restore focus/scroll from the loadout form. Reset after it is visible
    // and after the typewriter has changed the content height.
    this.resetScroll();
  }
  async close() {
    if (!this.dialog.open) return;
    this.writer.cancel(); this.animation?.cancel();
    const frames = this.isConsole ? [{transform:'translateY(20%)'},{transform:'translateY(90%)'}] : [{transform:'translateX(0)'},{transform:'translateX(-100%)'}];
    this.animation = this.dialog.animate(frames,{duration:this.reducedMotion ? 0 : 380,easing:'ease-in-out'});
    try { await this.animation.finished; } catch { return; }
    this.dialog.close(); document.querySelector('#terminal-toggle').setAttribute('aria-expanded','false');
    document.body.classList.remove('console-open');
    document.querySelector('#terminal-toggle').focus({preventScroll:true});
  }
  copy(id,text,suffix = '') {
    text = i18n.t(text);
    return `<p class="terminal-copy"><span class="sr-only">${escapeHtml(text)}</span><span id="${id}" aria-hidden="true" data-copy="${escapeHtml(text)}"></span>${suffix}</p>`;
  }
  resourceSummary(entries = []) {
    const localize = values => values?.[i18n.language] ?? values?.en;
    return entries.map((entry,index) => {
      const variants = localize(this.resourceLog.sources?.[entry.source]?.descriptions);
      const description = variants?.[entry.variant % variants.length] ?? i18n.t(entry.fallback || entry.source);
      const changes = Object.entries(entry.changes).map(([resource,delta]) => {
        const label = localize(this.resourceLog.resources?.[resource]) ?? resource;
        const sign = delta > 0 ? '+' : '−';
        const amount = Math.abs(delta);
        const accessible = escapeHtml(`${label} ${sign}${amount}`);
        return resource === 'energy'
          ? `<span class="summary-resource-change" role="img" aria-label="${accessible}"><span aria-hidden="true">${sign}</span>${'<img class="summary-battery-icon" src="assets/ui/battery.png" alt="" aria-hidden="true">'.repeat(amount)}</span>`
          : `<span class="summary-resource-change">${escapeHtml(label)} ${sign}${amount}</span>`;
      }).join(' ');
      return this.copy(`resource-copy-${index}`,description,` <span class="summary-resource-changes">${changes}</span>`);
    }).join('');
  }
  resetScroll() {
    document.querySelector('#terminal-scroll').scrollTop = 0;
    this.dialog.querySelector('.terminal-shell').scrollTop = 0;
    this.dialog.scrollTop = 0;
  }
  async fadeContentOut(reducedMotion) {
    this.writer.cancel();
    const nodes = [document.querySelector('#terminal-title'),this.content];
    if (!this.dialog.open || reducedMotion) { nodes.forEach(node => { node.style.opacity = '0'; }); return; }
    const animations = nodes.map(node => node.animate([{opacity:1},{opacity:0}],{duration:280,easing:'ease-in',fill:'forwards'}));
    try { await Promise.all(animations.map(animation => animation.finished)); } catch { return; }
    nodes.forEach(node => { node.style.opacity = '0'; });
    animations.forEach(animation => animation.cancel());
  }
  typeContent(reducedMotion) {
    const title = document.querySelector('#terminal-title');
    title.style.opacity = '1'; this.content.style.opacity = '1';
    const skip = document.querySelector('#skip-typing'); skip.hidden = reducedMotion;
    this.writer.play(this.jobs,{reducedMotion,onComplete:() => { skip.hidden = true; }});
  }
  render(state,event,{autoplay=this.dialog.open}={}) {
    this.writer.cancel();
    this.batterySlot.render(state);
    const title = state ? `SOL ${String(state.sol).padStart(2,'0')}` : 'OUTPOST / LINK';
    document.querySelector('#terminal-title').setAttribute('aria-label',title);
    document.querySelector('#restart').hidden = !state;
    if (!state) {
      this.content.innerHTML = this.copy('briefing-copy','loadout.intro') + `<form id="loadout-form"><div class="loadout">${this.tools.map(tool => `<label><input type="checkbox" name="tool" value="${escapeHtml(tool.id)}"><span>${escapeHtml(i18n.t(tool.name))}<small>${escapeHtml(i18n.t(tool.description))}</small></span></label>`).join('')}</div><div class="terminal-choices"><button class="terminal-choice" type="submit" disabled>${escapeHtml(i18n.t('loadout.chooseTwo'))}</button></div></form>`;
    } else {
      const previous = state.previousDaySummary.length ? state.previousDaySummary.map(line => i18n.t(line)).join('\n\n') : 'summary.arrival';
      let today = event.text;
      if (state.outcome) today = {success:'outcome.success',incomplete:'outcome.incomplete',unsafe:'outcome.unsafe'}[state.outcome];
      this.content.innerHTML = `<h2>${state.summarySol ? `SOL ${String(state.summarySol).padStart(2,'0')} / ${i18n.t('terminal.log')}` : i18n.t('terminal.arrivalLog')}</h2>${this.copy('summary-copy',previous)}${this.resourceSummary(state.previousResourceLog)}<h2>${escapeHtml(i18n.t(state.outcome ? 'terminal.missionComplete' : event.title))}</h2>${this.copy('event-copy',today)}<div id="terminal-decisions" class="terminal-choices"></div>`;
      const decisions = this.content.querySelector('#terminal-decisions');
      if (state.phase === 'event') {
        decisions.innerHTML = event.choices.filter(item => !item.work).map(item => choice('choose',item.id,item.label,choiceReason(state,item) || item.description,Boolean(choiceReason(state,item)))).join('');
        if (event.choices.some(item => item.work)) decisions.insertAdjacentHTML('beforeend',`<p class="terminal-note">${escapeHtml(i18n.t('tasks.eventOnClipboard'))}</p>`);
      } else if (state.phase === 'work') {
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('tasks.onTable'))}</p>`;
      } else if (state.phase === 'end') {
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('terminal.dayComplete'))}</p>${choice('next','',state.sol === 14 ? 'terminal.finishMission' : 'terminal.endDay',eventResolved(state,event) ? '' : 'error.eventUnresolved',!eventResolved(state,event))}`;
      }
      if (eventResolved(state,event)) {
        const result=event.choices.find(choice => choice.id === state.choiceId);
        decisions.insertAdjacentHTML('afterbegin',`<p class="terminal-note" role="status">${escapeHtml(i18n.t(result.summaryLine))}</p>`);
      }
      if (!state.outcome) {
        const light = LIGHT_ACTIONS.find(action => action.id === (state.lightsOn ? 'lights_off' : 'lights_on'));
        decisions.insertAdjacentHTML('beforeend',`<h2>${escapeHtml(i18n.t('terminal.lighting'))}</h2>` + choice('lights',light.id,light.label,light.narrative,!state.lightsOn && state.energy === 0));
      }
      if (state.tools.battery === 'ready' && !state.outcome) decisions.insertAdjacentHTML('beforeend',choice('battery','','battery.connect','battery.description',state.energy >= LIMITS.energy));
    }
    this.jobs = [{node:document.querySelector('#terminal-title'),text:title},...Array.from(this.content.querySelectorAll('[data-copy]'),node => ({node,text:node.dataset.copy}))];
    if (autoplay) this.writer.play(this.jobs,{reducedMotion:true});
    this.resetScroll();
  }
  updateSelection() {
    const form = document.querySelector('#loadout-form'); if (!form) return;
    const count = form.querySelectorAll('input:checked').length;
    const submit = form.querySelector('button[type=submit]'); submit.disabled = count !== 2;
    submit.textContent = i18n.t(count === 2 ? 'loadout.enter' : 'loadout.chooseTwo');
    form.querySelectorAll('input:not(:checked)').forEach(input => { input.disabled = count === 2; });
  }
  setReducedMotion(value) { this.reducedMotion = value; if (value) this.writer.skip(); }
  renderSettings() {
    this.writer.cancel();
    const title = i18n.t('menu.settings');
    document.querySelector('#terminal-title').textContent = title;
    document.querySelector('#terminal-title').setAttribute('aria-label',title);
    document.querySelector('#restart').hidden = true;
    this.content.innerHTML = `<label class="settings-field">${i18n.t('settings.language')}<select id="language-select">${i18n.languages.map(({code,name}) => `<option value="${code}" ${code === i18n.language ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label class="settings-field">${i18n.t('settings.volume')}<input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${this.volume ?? .65}"></label>`;
    this.jobs = [];
  }
}
