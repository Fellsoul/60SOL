import { choiceReason, dailyState } from '../models/DailyEventRules.js';
import { ACTIONS, unavailableReason } from '../models/ActionRules.js';
import { i18n } from '../services/I18n.js';
import { escapeHtml } from './dom.js';

const text = key => escapeHtml(i18n.t(key));

// Derive rows from saved state so completed and unfinished work survive reopening/reload.
export function clipboardTasks(state,event) {
  const eventChoices = (event?.choices ?? []).filter(choice => state.phase === 'event' || state.choiceId === choice.id);
  const rows = eventChoices.map(choice => ({...choice,command:'choose',
    done:state.choiceId === choice.id,
    reason:state.phase !== 'event' ? 'error.workUsed' : choiceReason(state,choice)}));
  return rows.concat(ACTIONS.filter(action => (!action.tool || state.tools[action.tool]) &&
    !eventChoices.some(choice => choice.action === action.id) &&
    !(state.phase === 'event' && event?.workResolutions?.[action.id])).map(action => ({...action,
    energy:action.id === 'grow' ? dailyState(state).careCost : action.energy,
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
  render(state,event) {
    this.state = state;
    i18n.translate(this.dialog);
    if (!state) { this.toggle.hidden = true; return; }
    document.querySelector('#tasks-sol').textContent = `SOL ${String(state.sol).padStart(2,'0')} / 14`;
    document.querySelector('#tasks-power').textContent = `${i18n.t('tasks.energy')} · ${state.energy} E`;
    this.toggle.setAttribute('aria-label',i18n.t('tasks.table'));
    this.toggle.dataset.phase = state.phase;
    const tasks = clipboardTasks(state,event);
    const completed = tasks.some(task => task.done);
    this.content.innerHTML = `<div class="task-list">${tasks.map(task => {
      const {done,reason} = task;
      return `<button class="task-row ${done ? 'is-complete' : ''}" data-action="${task.command}" data-id="${escapeHtml(task.id)}" ${done || reason ? 'disabled' : ''}><span class="task-checkbox" aria-hidden="true">${done ? '✓' : ''}</span><span class="task-details"><strong>${text(task.label)}</strong><small>${text(done ? 'tasks.checked' : reason || task.description)}</small><span class="task-cost">${task.energy} E · ${text(task.work === false ? 'tasks.noWork' : 'tasks.work')}</span></span></button>`;
    }).join('')}</div><p class="clipboard-note" role="status">${text(state.phase === 'event' ? (event?.blockedWork?.length === ACTIONS.length ? event.blockReason : 'tasks.pendingIndependent') : completed ? 'tasks.checked' : state.phase === 'end' ? 'tasks.eventWork' : state.phase === 'finished' ? 'tasks.finished' : 'tasks.choose')}</p>`;
    if (this.dialog.open && completed) document.querySelector('#tasks-close').focus({preventScroll:true});
  }
}
