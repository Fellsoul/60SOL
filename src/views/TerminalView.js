import { resourceAmount, resourceText, resourceInventory } from './ResourceIcons.js';
import { eventResolved } from '../models/DailyEventRules.js';
import { dailyActivitiesComplete } from '../models/DailyWorkRules.js';
import { escapeHtml } from './dom.js';
import { LIGHT_ACTIONS } from '../models/ActionRules.js';
import { Typewriter } from './Typewriter.js';
import { i18n } from '../services/I18n.js';
import { LIMITS } from '../models/state.js';
import { BatterySlotView } from './BatterySlotView.js';
import { ENDING_ART } from '../models/EndingRules.js';
import { spaceEvidence, snapshotSelector } from './SpaceEvidence.js';

function choice(action,id,label,description='',disabled=false) {
  label = i18n.t(label); description = i18n.t(description);
  return `<button class="terminal-choice" data-action="${action}" data-id="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}><span>${resourceText(label)}</span>${description ? `<small>${resourceText(description)}</small>` : ''}</button>`;
}

export class TerminalView {
  constructor(tools,events = [],resourceLog = {}) {
    this.resourceLog = resourceLog;
    this.events = events;
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
    this.isConsole = Boolean(state) && !state.outcome && mode === 'game';
    this.dialog.classList.toggle('is-console',this.isConsole);
    this.dialog.classList.toggle('is-report',Boolean(state?.outcome));
    if (mode === 'settings') this.renderSettings(); else this.render(state,event);
    this.dialog.showModal(); document.querySelector('#terminal-toggle').setAttribute('aria-expanded','true');
    document.body.classList.toggle('console-open',this.isConsole);
    this.animation?.cancel();
    const frames = this.isConsole ? [{transform:'translateY(90%)'},{transform:'translateY(20%)'}] : [{transform:'translateX(-100%)'},{transform:'translateX(0)'}];
    this.animation = this.dialog.animate(frames,{duration:reducedMotion ? 0 : 560,easing:'cubic-bezier(.16,1,.3,1)'});
    document.querySelector('#terminal-close').focus({preventScroll:true});
    const instant = reducedMotion || Boolean(state?.outcome);
    const skip = document.querySelector('#skip-typing'); skip.hidden = instant;
    this.writer.play(this.jobs,{reducedMotion:instant,onComplete:() => { skip.hidden = true; }});
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
    return `<p class="terminal-copy"><span class="sr-only">${escapeHtml(text)}</span><span id="${id}" aria-hidden="true" data-copy="${escapeHtml(text)}"></span>${suffix ? `<span data-copy-after hidden>${suffix}</span>` : ''}</p>`;
  }
  resourceSummary(entries = [],prefix = 'resource-copy') {
    const localize = values => values?.[i18n.language] ?? values?.en;
    return entries.map((entry,index) => {
      const variants = localize(this.resourceLog.sources?.[entry.source]?.descriptions);
      const description = variants?.[entry.variant % variants.length] ?? i18n.t(entry.fallback || entry.source);
      // A change in the daily generation rate is not electricity produced.
      // Older saves only retained actual charging, so do not invent their gross output.
      const deltas = entry.source === 'generation'
        ? {...(entry.generated !== undefined ? {generation:entry.generated} : {}),energy:entry.changes.energy ?? 0}
        : entry.changes;
      const changes = Object.entries(deltas).map(([resource,delta]) => {
        const solar = entry.source === 'generation';
        const label = solar ? i18n.t(resource === 'generation' ? 'resources.generatedPower' : 'resources.storedPower') : localize(this.resourceLog.resources?.[resource]) ?? resource;
        const sign = delta >= 0 ? '+' : '−';
        const amount = Math.abs(delta);
        const accessible = escapeHtml(`${label} ${sign}${amount}`);
        if (['food','localData','pendingData','sentData'].includes(resource)) return `<span class="summary-resource-change"><span>${sign}</span>${resourceAmount(resource,amount)}</span>`;
        if (resource === 'energy' || (solar && resource === 'generation')) {
          const battery = '<img class="summary-battery-icon" src="assets/ui/battery.png" alt="" aria-hidden="true">';
          const icons = `${battery}<span aria-hidden="true">× ${amount}</span>`;
          return `<span class="summary-resource-change" role="img" aria-label="${accessible}">${solar ? `<span aria-hidden="true">${escapeHtml(label)}</span>` : ''}<span aria-hidden="true">${sign}</span>${icons}</span>`;
        }
        return `<span class="summary-resource-change">${escapeHtml(label)} ${sign}${amount}</span>`;
      }).join(' ');
      return this.copy(`${prefix}-${index}`,description,` <span class="summary-resource-changes">${changes}</span>`);
    }).join('');
  }
  resetScroll() {
    document.querySelector('#terminal-scroll').scrollTop = 0;
    this.dialog.querySelector('.terminal-shell').scrollTop = 0;
    this.dialog.scrollTop = 0;
  }
  missionSummary(state) {
    const text = key => resourceText(i18n.t(key));
    const journal = state.missionJournal ?? (state.summarySol ? [{sol:state.summarySol,
      summary:state.previousDaySummary, resources:state.previousResourceLog ?? [], events:[]}] : []);
    const lastSol = Math.min(LIMITS.sols,state.summarySol || state.sol);
    const days = Array.from({length:lastSol},(_,index) => {
      const sol = index+1;
      const day = journal.find(entry => entry.sol === sol);
      const heading = `<h2>SOL ${String(sol).padStart(2,'0')}</h2>`;
      if (!day) return `<section class="mission-day" data-sol="${sol}">${heading}<p>${text('ending.missingLog')}</p></section>`;
      const events = day.events.map(event => `<li><p>${text(event.summaryLine)}</p><p class="mission-choice">${text(event.choiceSummary ?? 'ending.eventUnresolved')}</p></li>`).join('');
      const choices = new Set(day.events.map(event => event.choiceSummary));
      const actions = day.summary.filter(line => !choices.has(line)).map(line => `<li>${text(line)}</li>`).join('');
      const resources = day.resources.length ? `<details class="mission-resources"><summary>${text('ending.resourceDetails')}</summary>${this.resourceSummary(day.resources,`journal-${sol}`)}</details>` : '';
      return `<section class="mission-day" data-sol="${sol}">${heading}${events ? `<ul class="mission-events">${events}</ul>` : ''}${actions ? `<ul class="mission-actions">${actions}</ul>` : ''}${resources}</section>`;
    }).join('');
    return `<h2>${text(`ending.${ENDING_ART[state.outcome]}.name`)}</h2><p>${text(`outcome.${state.outcome}`)}</p>${resourceInventory(state)}<h2>${text('ending.journal')}</h2>${days}`;
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
    this.batterySlot.render(state?.outcome ? null : state);
    const title = state?.outcome ? i18n.t('ending.title') : state ? `SOL ${String(state.sol).padStart(2,'0')}` : 'OUTPOST / LINK';
    const generation = document.querySelector('#terminal-generation');
    generation.hidden = !state || Boolean(state.outcome);
    generation.textContent = state ? `${i18n.t('terminal.generation')} +${state.generation} E` : '';
    generation.title = i18n.t('terminal.generationHint');
    document.querySelector('#terminal-title').setAttribute('aria-label',title);
    document.querySelector('#restart').hidden = !state;
    if (!state) {
      this.content.innerHTML = this.copy('briefing-copy','loadout.intro') + `<form id="loadout-form"><div class="loadout">${this.tools.filter(tool => tool.selectable !== false).map(tool => `<label><input type="checkbox" name="tool" value="${escapeHtml(tool.id)}"><span>${escapeHtml(i18n.t(tool.name))}<small>${escapeHtml(i18n.t(tool.description))}</small></span></label>`).join('')}</div><div class="terminal-choices"><button class="terminal-choice" type="submit" disabled>${escapeHtml(i18n.t('loadout.chooseTwo'))}</button></div></form>`;
    } else if (state.outcome) {
      this.content.innerHTML = this.missionSummary(state);
    } else {
      const previous = state.previousDaySummary.length ? state.previousDaySummary.map(line => i18n.t(line)).join('\n\n') : 'summary.arrival';
      const today = event.text;
      this.content.innerHTML = `${resourceInventory(state)}<h2>${state.summarySol ? `SOL ${String(state.summarySol).padStart(2,'0')} / ${i18n.t('terminal.log')}` : i18n.t('terminal.arrivalLog')}</h2>${this.copy('summary-copy',previous)}${this.resourceSummary(state.previousResourceLog)}<h2>${escapeHtml(i18n.t(state.outcome ? 'terminal.missionComplete' : event.title))}</h2>${this.copy('event-copy',today)}<div id="terminal-decisions" class="terminal-choices"></div>`;
      const decisions = this.content.querySelector('#terminal-decisions');
      if (state.tools.monitor === 'ready' && state.sol < LIMITS.sols) {
        const weather = this.environment?.days?.[String(state.sol+1)] ?? this.environment?.default ?? 'clear';
        const forecast = weather === 'sandstorm' ? 'monitor.storm' : 'monitor.clear';
        decisions.insertAdjacentHTML('beforebegin',`<section class="weather-forecast"><h2>${escapeHtml(i18n.t('monitor.forecast'))} · SOL ${state.sol+1}</h2>${this.copy('forecast-copy',forecast)}</section>`);
      }
      if (state.phase === 'event') {
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('tasks.eventOnClipboard'))}</p>`;
      } else if (state.phase === 'work' && !dailyActivitiesComplete(state,event)) {
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('tasks.onTable'))}</p>`;
      } else if (state.phase === 'end' || dailyActivitiesComplete(state,event)) {
        const complete = eventResolved(state,event) && !(state.concurrentEvents ?? []).some(item => !item.choiceId);
        decisions.innerHTML = `<p class="terminal-note">${escapeHtml(i18n.t('terminal.dayComplete'))}</p>${choice('next','',state.sol === 14 ? 'terminal.finishMission' : 'terminal.endDay',complete ? '' : 'error.eventUnresolved',!complete)}`;
      }
      if (eventResolved(state,event)) {
        const result=event.choices.find(choice => choice.id === state.choiceId);
        decisions.insertAdjacentHTML('afterbegin',`<p class="terminal-note" role="status">${resourceText(i18n.t(result.summaryLine))}</p>`);
      }
      if (!state.outcome) {
        const light = LIGHT_ACTIONS.find(action => action.id === (state.lightsOn ? 'lights_off' : 'lights_on'));
        decisions.insertAdjacentHTML('beforeend',`<h2>${escapeHtml(i18n.t('terminal.lighting'))}</h2>` + choice('lights',light.id,light.label,light.narrative,!state.lightsOn && state.energy === 0));
      }
      if (state.tools.battery === 'ready' && !state.outcome) decisions.insertAdjacentHTML('beforeend',choice('battery','','battery.connect','battery.description',state.energy >= LIMITS.energy));
    }
    if (state) this.content.insertAdjacentHTML('beforeend',spaceEvidence(state));
    else this.content.querySelector('#loadout-form')?.insertAdjacentHTML('afterbegin',snapshotSelector());
    this.jobs = [{node:document.querySelector('#terminal-title'),text:title},...Array.from(this.content.querySelectorAll('[data-copy]'),node => ({node,text:node.dataset.copy,after:Array.from(node.parentElement.querySelectorAll('[data-copy-after]'))}))];
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
