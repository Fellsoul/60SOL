import { ACTIONS, unavailableReason } from '../models/ActionRules.js';
import { escapeHtml } from './dom.js';
import { Typewriter } from './Typewriter.js';
import { i18n } from '../services/I18n.js';

function choice(action,id,label,description='',disabled=false) {
  label = i18n.t(label); description = i18n.t(description);
  return `<button class="terminal-choice" data-action="${action}" data-id="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}><span>${escapeHtml(label)}</span>${description ? `<small>${escapeHtml(description)}</small>` : ''}</button>`;
}

export class TerminalView {
  constructor(tools) {
    this.tools = tools; this.dialog = document.querySelector('#terminal'); this.content = document.querySelector('#terminal-content');
    this.writer = new Typewriter(); this.animation = null;
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
    document.querySelector('#terminal-close').focus();
    const skip = document.querySelector('#skip-typing'); skip.hidden = reducedMotion;
    this.writer.play(this.jobs,{reducedMotion,onComplete:() => { skip.hidden = true; }});
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
  copy(id,text) {
    text = i18n.t(text);
    return `<p class="terminal-copy"><span class="sr-only">${escapeHtml(text)}</span><span id="${id}" aria-hidden="true" data-copy="${escapeHtml(text)}"></span></p>`;
  }
  render(state,event) {
    this.writer.cancel();
    const title = state ? `SOL ${String(state.sol).padStart(2,'0')}` : 'OUTPOST / LINK';
    document.querySelector('#terminal-title').setAttribute('aria-label',title);
    document.querySelector('#restart').hidden = !state;
    if (!state) {
      this.content.innerHTML = this.copy('briefing-copy','气闸即将开启。只能带上两件工具。做好决定后，就进入前哨站。') + `<form id="loadout-form"><div class="loadout">${this.tools.map(tool => `<label><input type="checkbox" name="tool" value="${escapeHtml(tool.id)}"><span>${escapeHtml(tool.name)}<small>${escapeHtml(tool.description)}</small></span></label>`).join('')}</div><div class="terminal-choices"><button class="terminal-choice" type="submit" disabled>选择两件工具</button></div></form>`;
    } else {
      const previous = state.previousDaySummary.length ? state.previousDaySummary.map(line => i18n.t(line)).join('\n\n') : '航程结束。我们抵达了前哨站，还没有昨日的基地记录。';
      let today = event.text;
      if (state.outcome) today = {success:'地球确认了我们的研究成果。任务完成，我们可以回家了。',incomplete:'队员安全度过了任务期。还有研究记录未能完成交付，但保护彼此的努力值得被记住。',unsafe:'基地已经无法安全继续任务。我们需要停止作业，优先保护队员。'}[state.outcome];
      this.content.innerHTML = `<h2>${state.summarySol ? `SOL ${String(state.summarySol).padStart(2,'0')} / ${i18n.t('记录')}` : i18n.t('抵达记录')}</h2>${this.copy('summary-copy',previous)}<h2>${escapeHtml(i18n.t(state.outcome ? '任务结束' : event.title))}</h2>${this.copy('event-copy',today)}<div id="terminal-decisions" class="terminal-choices"></div>`;
      const decisions = this.content.querySelector('#terminal-decisions');
      if (state.phase === 'event') {
        decisions.innerHTML = event.choices.map(item => choice('choose',item.id,item.label,state.energy < item.energy ? '目前的供电不足以执行这个决定。' : item.description,state.energy < item.energy)).join('');
      } else if (state.phase === 'work') {
        decisions.innerHTML = `<h2>接下来的工作</h2>` + ACTIONS.filter(action => !action.tool || state.tools[action.tool]).map(action => {
          const reason = unavailableReason(state,action);
          return choice('work',action.id,action.label,reason || action.narrative,Boolean(reason));
        }).join('');
      } else if (state.phase === 'end') {
        decisions.innerHTML = `<p class="terminal-note">今天的安排已经执行。可以关闭终端看看基地，或让这一天结束。</p>${choice('next','',state.sol === 14 ? '结束任务，读取最后的记录' : '结束今天')}`;
      }
      if (state.tools.battery === 'ready' && !state.outcome) decisions.insertAdjacentHTML('beforeend',choice('battery','','接入备用电池','一次性补充供电，储物位置将空出来。',state.energy === 20));
    }
    document.querySelector('#terminal-scroll').scrollTop = 0;
    i18n.translate(this.content);
    this.jobs = [{node:document.querySelector('#terminal-title'),text:title},...Array.from(this.content.querySelectorAll('[data-copy]'),node => ({node,text:node.dataset.copy}))];
    if (this.dialog.open) this.writer.play(this.jobs,{reducedMotion:true});
  }
  updateSelection() {
    const form = document.querySelector('#loadout-form'); if (!form) return;
    const count = form.querySelectorAll('input:checked').length;
    const submit = form.querySelector('button[type=submit]'); submit.disabled = count !== 2;
    submit.textContent = i18n.t(count === 2 ? '进入前哨站' : '选择两件工具');
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
