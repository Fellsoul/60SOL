import { choiceReason, choiceEnergy, eventResolved, emergencyCleanAvailable } from '../models/DailyEventRules.js';
import { dailyActivitiesComplete } from '../models/DailyWorkRules.js';
import { ACTIONS, unavailableReason, workEnergy } from '../models/ActionRules.js';
import { i18n } from '../services/I18n.js';
import { escapeHtml } from './dom.js';
import { CREW_IDS, expeditionReason, robotSampleReason, researchUses, ROBOT_SAMPLE_ENERGY } from '../models/ExpeditionRules.js';
import { crewHead, crewStatuses } from './CrewStatus.js';
import { concurrentEvent, concurrentChoiceReason } from '../models/ConcurrentEvents.js';
import { resourceText, resourceInventory } from './ResourceIcons.js';
import { toolkitIcon } from './SceneToolsView.js';

const text = key => resourceText(i18n.t(key));
// Match the room portraits: astronaut B (glasses) sits left, astronaut A sits right.
const crewDisplayOrder = ['astronaut-b', 'astronaut-a'];
const batteryIcon = '<img class="task-battery-icon" src="assets/ui/battery.png" alt="" aria-hidden="true">';
const energyCost = energy => `<span class="task-energy-cost" role="img" aria-label="${text('tasks.cost')}: ${energy} E"><span aria-hidden="true">−</span>${energy > 4 ? `${batteryIcon}<span aria-hidden="true">× ${energy}</span>` : energy > 0 ? batteryIcon.repeat(energy) : '<span aria-hidden="true">0</span>'}</span>`;
const toolBadge = task => task.tool === 'toolkit' ? `<span class="tool-badge">${toolkitIcon}${text('tool.toolkit.name')}</span>` : '';

// Derive rows from saved state so completed and unfinished work survive reopening/reload.
export function clipboardTasks(state,event) {
  const pending = Boolean(event?.choices.length && !eventResolved(state,event));
  const eventChoices = (event?.choices ?? []).filter(choice => pending || state.choiceId === choice.id);
  const rows = eventChoices.map(choice => ({...choice,energy:choiceEnergy(state,choice),command:'choose',
    done:state.choiceId === choice.id,
    reason:state.phase !== 'event' ? 'error.workUsed' : choiceReason(state,choice)}));
  if (pending) return rows;
  return rows.concat(ACTIONS.filter(action => !action.tool || state.tools[action.tool]).map(action => ({...action,
    energy:workEnergy(state,action),
    description:action.narrative,command:'work',done:state.workId === action.id,
    reason:unavailableReason(state,action,event)})));
}

export class TaskView {
  constructor() {
    this.dialog = document.querySelector('#tasks');
    this.toggle = document.createElement('button');
    this.toggle.id = 'tasks-toggle'; this.toggle.type = 'button'; this.toggle.hidden = true; this.toggle.disabled = true;
    this.toggle.setAttribute('aria-haspopup','dialog'); this.toggle.setAttribute('aria-controls','tasks'); this.toggle.setAttribute('aria-expanded','false');
    this.toggle.setAttribute('data-i18n-aria-label','tasks.table');
    this.toggle.innerHTML = `<svg class="table-clipboard" viewBox="0 0 140 100" aria-hidden="true"><path d="M14 8 L126 8 L134 92 L6 92 Z" fill="#70513a" stroke="#302c26" stroke-width="3"/><path d="M22 16 L118 16 L124 83 L16 83 Z" fill="#eee2c1" stroke="#b8a582"/><path d="M50 7 L90 7 L92 22 L48 22 Z" fill="#a5aaa0" stroke="#424940" stroke-width="2"/><g fill="none" stroke="#797562" stroke-width="2"><path d="M29 35h8v8h-8z M30 52h8v8h-8z M31 69h8v8h-8z"/><path d="M45 38h55 M46 55h48 M47 72h55"/></g></svg>`;
    this.content = document.querySelector('#tasks-content');
    this.content.addEventListener('change',event => {
      if (event.target.id !== 'expedition-check') return;
      this.selecting = event.target.checked;
      this.content.querySelector('[data-crew-picker]').hidden = !this.selecting;
    });
    this.dialog.addEventListener('cancel',event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('click',event => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
    });
  }
  mount() { document.querySelector('#scene').append(this.toggle); }
  open() {
    if (!this.state || this.dialog.open) return;
    this.dialog.showModal(); this.toggle.setAttribute('aria-expanded','true');
    document.querySelector('#tasks-close').focus();
  }
  close() {
    if (!this.dialog.open) return;
    this.dialog.close(); this.toggle.setAttribute('aria-expanded','false');
    this.toggle.focus({preventScroll:true});
  }
  sampling(state,event) {
    const plan=state.expeditionPlan;
    if (this.selectingSol !== state.sol) { this.selecting=false; this.selectingSol=state.sol; }
    const checked=Boolean(plan || this.selecting);
    const disabled=CREW_IDS.every(id => expeditionReason(state,id)) && !plan;
    const robotReason=robotSampleReason(state,event);
    return `<section class="sampling-board"><h2>${text('sampling.title')}</h2><p class="sample-stock">${text('sampling.stock')}: <strong>${state.samples.length} / 3</strong> · ${text('sampling.uses')}: <strong>${researchUses(state)}</strong></p><p class="sampling-hint">${text('sampling.rules')}</p>
      <label class="expedition-toggle"><input id="expedition-check" type="checkbox" ${checked ? 'checked' : ''} ${state.phase === 'finished' || disabled ? 'disabled' : ''}><span>${text('sampling.planTomorrow')} <small>SOL ${state.sol+1}</small></span></label>
      ${disabled ? `<p class="sampling-hint">${text(CREW_IDS.map(id => expeditionReason(state,id)).find(Boolean))}</p>` : ''}
      <div class="crew-picker" data-crew-picker ${checked ? '' : 'hidden'}>${crewDisplayOrder.map(id => {
        const reason=expeditionReason(state,id),selected=plan?.crewId===id;
        return `<button type="button" class="crew-choice${selected ? ' is-selected' : ''}" data-action="expedition" data-id="${id}" aria-pressed="${selected}" ${reason ? 'disabled' : ''} title="${escapeHtml(crewStatuses(state,id).join('\n'))}">${crewHead(id)}<strong>${text(`crew.${id.replaceAll('-','_')}.name`)}</strong><small>${text(reason || (selected ? 'sampling.selected' : 'sampling.selectCrew'))}</small></button>`;
      }).join('')}</div>
      <p class="sampling-hint">${text(plan ? 'sampling.plannedHint' : 'sampling.selectHint')}</p>
      ${Object.hasOwn(state.tools,'robot') ? `<button type="button" class="robot-sample" data-action="robot-sample" ${robotReason ? 'disabled' : ''}><strong>${text('action.robot.label')}</strong><small>${text(robotReason || 'action.robot.narrative')}</small><span>${energyCost(ROBOT_SAMPLE_ENERGY)} · ${text('tasks.noWork')}</span></button>` : ''}</section>`;
  }
  render(state,event) {
    this.state = state;
    i18n.translate(this.dialog);
    if (!state) { this.toggle.hidden = true; return; }
    document.querySelector('#tasks-sol').textContent = `SOL ${String(state.sol).padStart(2,'0')} / 14`;
    const power = document.querySelector('#tasks-power');
    power.innerHTML = `${batteryIcon}<span aria-hidden="true">${state.energy}</span>`;
    power.setAttribute('aria-label',`${i18n.t('tasks.energy')}: ${state.energy} E`);
    this.toggle.setAttribute('aria-label',i18n.t('tasks.table'));
    this.toggle.dataset.phase = state.phase;
    const tasks = clipboardTasks(state,event);
    const completed = tasks.some(task => task.done);
    const note = !eventResolved(state,event) ? 'tasks.eventFirst' : state.phase === 'finished' ? 'tasks.finished' : state.workId ? (state.workId.startsWith('event:') ? 'tasks.eventWork' : 'tasks.checked') : dailyActivitiesComplete(state,event) ? 'tasks.noActivities' : 'tasks.choose';
    const eventCopy = event?.choices.length ? `<section class="clipboard-event${eventResolved(state,event) ? ' is-resolved' : ''}"><h2>${text(event.title)}</h2>${event.sceneCue ? '' : `<p>${text(event.text)}</p>`}</section>` : '';
    this.content.innerHTML = `${resourceInventory(state)}${this.concurrentTasks(state)}${eventCopy}${this.emergencyTasks(state,event)}<div class="task-list">${tasks.map(task => {
      const {done,reason} = task;
      return `<button class="task-row ${done ? 'is-complete' : ''}" data-action="${task.command}" data-id="${escapeHtml(task.id)}" ${done || reason ? 'disabled' : ''}><span class="task-checkbox" aria-hidden="true">${done ? '✓' : ''}</span><span class="task-details"><strong>${text(task.label)}</strong>${toolBadge(task)}<small>${text(done ? 'tasks.checked' : reason || task.description)}</small><span class="task-cost">${energyCost(task.energy)}<span> · ${text(task.work === false ? 'tasks.noWork' : 'tasks.work')}</span></span></span></button>`;
    }).join('')}</div><p class="clipboard-note" role="status">${text(note)}</p>${dailyActivitiesComplete(state,event) ? this.sampling(state,event) : ''}`;
    if (this.dialog.open && completed) document.querySelector('#tasks-close').focus({preventScroll:true});
  }
  emergencyTasks(state,event) {
    const emergency = this.events?.find(item => item.id === 'emergency_clean');
    if (!emergency) return '';
    const done = state.history.emergency_clean === state.sol;
    if (!done && !emergencyCleanAvailable(state,event)) return '';
    return `<section class="clipboard-event"><h2>${text(emergency.title)}</h2><p>${text(emergency.text)}</p>${emergency.choices.filter(choice => !done || state.daySummary.includes(choice.summaryLine)).map(choice => {
      const reason = choiceReason(state,choice);
      return `<button class="task-row ${done ? 'is-complete' : ''}" data-action="emergency_clean" data-id="${escapeHtml(choice.id)}" ${done || reason ? 'disabled' : ''}><span class="task-checkbox" aria-hidden="true">${done ? '✓' : ''}</span><span class="task-details"><strong>${text(choice.label)}</strong>${toolBadge(choice)}<small>${text(done ? choice.summaryLine : reason || choice.description)}</small><span class="task-cost">${energyCost(choiceEnergy(state,choice))} · ${text(choice.work ? 'tasks.work' : 'tasks.noWork')}</span></span></button>`;
    }).join('')}</section>`;
  }
  concurrentTasks(state) {
    return (state.concurrentEvents ?? []).map(instance => {
      const event = concurrentEvent(instance, { get: id => this.events?.find(item => item.id === id) });
      if (!event) return '';
      const crew = instance.crewId ? ` · ${text(`crew.${instance.crewId.replaceAll('-','_')}.name`)}` : '';
      return `<section class="clipboard-event"><h2>${text(event.title)}${crew}</h2>${event.choices
        .filter(choice => !instance.choiceId || choice.id === instance.choiceId).map(choice => {
          const reason = concurrentChoiceReason(state,choice,this.events?.find(item => item.id === state.currentEventId));
          return `<button class="task-row ${instance.choiceId ? 'is-complete' : ''}" data-action="concurrent" data-instance="${escapeHtml(instance.id)}" data-id="${escapeHtml(choice.id)}" ${instance.choiceId || reason ? 'disabled' : ''}><span class="task-checkbox">${instance.choiceId ? '✓' : ''}</span><span class="task-details"><strong>${text(choice.label)}</strong>${toolBadge(choice)}<small>${text(instance.choiceId ? 'tasks.checked' : reason || choice.description)}</small><span class="task-cost">${energyCost(choiceEnergy(state,choice))} · ${text(choice.work ? 'tasks.work' : 'tasks.noWork')}</span></span></button>`;
        }).join('')}</section>`;
    }).join('');
  }
}
