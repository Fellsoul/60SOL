import { snapshotSelector, snapshotComparison } from './SpaceEvidence.js';
import { choiceReason, eventResolved, emergencyCleanAvailable } from '../models/DailyEventRules.js';
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
  constructor(tools,events = [],resourceLog = {}) {
    this.resourceLog = resourceLog;
    this.tools = tools; this.events = events; this.dialog = document.querySelector('#terminal'); this.content = document.querySelector('#terminal-content');
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
  resourceSummary(entries = [],prefix = 'resource-copy') {
    const localize = values => values?.[i18n.language] ?? values?.en;
    return entries.map((entry,index) => {
      const variants = localize(this.resourceLog.sources?.[entry.source]?.descriptions);
      const description = variants?.[entry.variant % variants.length] ?? i18n.t(entry.fallback || entry.source);
      // Generation is a daily rate, not another resource gain. Show only power
      // actually stored, including a zero when the batteries were already full.
      const deltas = entry.source === 'generation' ? {energy:entry.changes.energy ?? 0} : entry.changes;
      const changes = Object.entries(deltas).map(([resource,delta]) => {
        const label = localize(this.resourceLog.resources?.[resource]) ?? resource;
        const sign = delta >= 0 ? '+' : '−';
        const amount = Math.abs(delta);
        const accessible = escapeHtml(`${label} ${sign}${amount}`);
        if (resource === 'energy') {
          const battery = '<img class="summary-battery-icon" src="assets/ui/battery.png" alt="" aria-hidden="true">';
          const icons = amount > 4 ? `${battery}<span aria-hidden="true">× ${amount}</span>`
            : amount > 0 ? battery.repeat(amount) : '<span aria-hidden="true">0</span>';
          return `<span class="summary-resource-change" role="img" aria-label="${accessible}"><span aria-hidden="true">${sign}</span>${icons}</span>`;
        }
        return `<span class="summary-resource-change">${escapeHtml(label)} ${sign}${amount}</span>`;
      }).join(' ');
      return this.copy(`${prefix}-${index}`,description,` <span class="summary-resource-changes">${changes}</span>`);
    }).join('');
  }
  todayRecords(state) {
    if (state.outcome) return ''; // The final Sol is already shown as the completed day's log.
    const entries = state.resourceLog ?? [];
    const detailed = new Set(entries.filter(entry => entry.fallback).map(entry => i18n.t(entry.fallback)));
    const lines = state.daySummary.map(line => i18n.t(line)).filter(line => !detailed.has(line));
    const narrative = lines.length ? this.copy('today-summary-copy',lines.join('\n\n')) : '';
    const empty = !lines.length && !entries.length ? this.copy('today-empty-copy','terminal.noRecords') : '';
    return `<section id="today-records"><h2>SOL ${String(state.sol).padStart(2,'0')} / ${escapeHtml(i18n.t('terminal.todayRecords'))}</h2>${narrative}${this.resourceSummary(entries,'today-resource-copy')}${empty}</section>`;
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
    const generation = document.querySelector('#terminal-generation');
    generation.hidden = !state;
    generation.textContent = state ? `${i18n.t('terminal.generation')} +${state.generation} E` : '';
    generation.title = i18n.t('terminal.generationHint');
    document.querySelector('#terminal-title').setAttribute('aria-label',title);
    document.querySelector('#restart').hidden = !state;
    if (!state) {
      this.content.innerHTML = this.copy('briefing-copy','loadout.intro') + `<form id="loadout-form">${snapshotSelector()}<div class="loadout">${this.tools.map(tool => `<label><input type="checkbox" name="tool" value="${escapeHtml(tool.id)}"><span>${escapeHtml(i18n.t(tool.name))}<small>${escapeHtml(i18n.t(tool.description))}</small></span></label>`).join('')}</div><div class="terminal-choices"><button class="terminal-choice" type="submit" disabled>${escapeHtml(i18n.t('loadout.chooseTwo'))}</button></div></form>`;
    } else {
      const hasLightingDetail = state.previousResourceLog?.some(entry => entry.source === 'lighting');
      const previousLines = state.previousDaySummary.filter(line => !(hasLightingDetail && i18n.t(line) === i18n.t('summary.lightingCost')));
      const previous = state.previousDaySummary.length ? previousLines.map(line => i18n.t(line)).join('\n\n') : 'summary.arrival';
      let today = event.text;
      if (state.outcome) today = {success:'outcome.success',incomplete:'outcome.incomplete',unsafe:'outcome.unsafe'}[state.outcome];
      const todayCopy = event.sceneCue && !state.outcome ? '' : `<h2>${escapeHtml(i18n.t(state.outcome ? 'terminal.missionComplete' : event.title))}</h2>${this.copy('event-copy',today)}`;
      this.content.innerHTML = `${this.todayRecords(state)}<h2>${state.summarySol ? `SOL ${String(state.summarySol).padStart(2,'0')} / ${i18n.t('terminal.log')}` : i18n.t('terminal.arrivalLog')}</h2>${this.copy('summary-copy',previous)}${this.resourceSummary(state.previousResourceLog)}${todayCopy}<div id="terminal-decisions" class="terminal-choices"></div>`;
      const decisions = this.content.querySelector('#terminal-decisions');
      if (state.phase === 'event') {
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('tasks.eventOnClipboard'))}</p>`;
      } else if (state.phase === 'work') {
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('tasks.onTable'))}</p>`;
      } else if (state.phase === 'end') {
        const complete = eventResolved(state,event) && !(state.concurrentEvents ?? []).some(item => !item.choiceId);
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('terminal.dayComplete'))}</p>${choice('next','',state.sol === 14 ? 'terminal.finishMission' : 'terminal.endDay',complete ? '' : 'error.eventUnresolved',!complete)}`;
      }
      const emergency = this.events.find(item => item.id === 'emergency_clean');
      if (emergency && state.history.emergency_clean !== state.sol && emergencyCleanAvailable(state,event)) {
        decisions.insertAdjacentHTML('beforeend',`<section class="emergency-event"><h2>${escapeHtml(i18n.t(emergency.title))}</h2><p>${escapeHtml(i18n.t(emergency.text))}</p>${emergency.choices.map(item => {
          const reason = choiceReason(state,item);
          return choice('emergency_clean',item.id,item.label,reason || item.description,Boolean(reason));
        }).join('')}</section>`);
      }
      if (!state.outcome) {
        const light = LIGHT_ACTIONS.find(action => action.id === (state.lightsOn ? 'lights_off' : 'lights_on'));
        decisions.insertAdjacentHTML('beforeend',`<h2>${escapeHtml(i18n.t('terminal.lighting'))}</h2>` + choice('lights',light.id,light.label,light.narrative,!state.lightsOn && state.energy === 0));
      }
      if (state.tools.battery === 'ready' && !state.outcome) decisions.insertAdjacentHTML('beforeend',choice('battery','','battery.connect','battery.description',state.energy >= LIMITS.energy));
    }
    if(state?.outcome)this.content.insertAdjacentHTML('beforeend',snapshotComparison(state));
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
    document.querySelector('#terminal-generation').hidden = true;
    const title = i18n.t('menu.settings');
    document.querySelector('#terminal-title').textContent = title;
    document.querySelector('#terminal-title').setAttribute('aria-label',title);
    document.querySelector('#restart').hidden = true;
    this.content.innerHTML = `<label class="settings-field">${i18n.t('settings.language')}<select id="language-select">${i18n.languages.map(({code,name}) => `<option value="${code}" ${code === i18n.language ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label class="settings-field">${i18n.t('settings.volume')}<input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${this.volume ?? .65}"></label>`;
    this.jobs = [];
  }
}
