import { i18n } from '../services/I18n.js';
import { eventResolved } from '../models/DailyEventRules.js';
export class GameController {
  constructor(model,view,repository,snapshots=null) { this.snapshots=snapshots; this.model = model; this.view = view; this.repository = repository; this.busy = false; this.activeSaveId = null; }
  async startMission(ids,mode='current') {
    if(this.busy)return;
    this.busy=true;
    let snapshot;
    try { snapshot=this.snapshots ? await this.snapshots.select(mode) : null; }
    catch { this.view.notify('space.unavailable');this.busy=false;return; }
    this.busy=false;
    this.activeSaveId=null;
    this.view.coverScene();
    await this.commit(()=>this.model.start(ids,snapshot),{morning:true,initial:true});
  }
  showMenu() {
    void this.view.music?.setMode('menu');
    this.view.stopActivity?.();
    const result = this.repository.list();
    this.view.menu.show(result.saves.some(save => save.state));
    if (result.message) this.view.notify(result.message);
  }
  showSaves(notice = '') {
    const {saves,message} = this.repository.list();
    this.view.menu.showSaves(saves,message || notice);
  }
  loadSave(id) {
    const loaded = this.repository.load(id);
    if (!loaded.state) { this.showSaves('save.unavailable'); return; }
    // Cover the scene before closing the menu so a saved scene can never flash onscreen.
    this.view.coverScene();
    void this.commit(() => { this.model.restore(loaded.state); this.activeSaveId = id; },{morning:true,initial:true,save:false});
  }
  deleteSave(id,label) {
    if (!confirm(`${i18n.t('save.confirmDelete')}\n\n${label}`)) return;
    const result = this.repository.delete(id);
    if (result.ok) {
      if (this.activeSaveId === id) this.activeSaveId = null;
      this.showMenu();
    }
    this.showSaves(result.message);
  }
  async toggleLights() {
    const state = this.model.snapshot;
    if (this.busy || !state || state.phase === 'finished' || (!state.lightsOn && state.energy === 0)) return;
    await this.commit(() => this.model.setLights(!state.lightsOn),{keepTerminal:true});
  }
  async start() {
    this.showMenu();
    document.querySelector('#main-menu').addEventListener('click',event => {
      const command = event.target.closest('[data-menu]')?.dataset.menu;
      if (this.busy || !command) return;
      if (command === 'settings') { void this.view.terminal.open(null,null,this.view.reducedMotion,'settings'); return; }
      if (command === 'new') {
        this.activeSaveId = null; this.model.restore(null); void this.view.terminal.open(null,null,this.view.reducedMotion); return;
      }
      if (command === 'load') { this.showSaves(); return; }
      if (command === 'continue') {
        const latest = this.repository.list().saves.find(save => save.state);
        if (!latest) { this.showMenu(); this.view.notify(i18n.t('save.unavailable')); return; }
        this.loadSave(latest.id);
      }
    });
    document.querySelector('#save-list').addEventListener('click',event => {
      const button = event.target.closest('button[data-save-id],button[data-save-delete]');
      if (!button || button.disabled || this.busy) return;
      if (button.hasAttribute('data-save-delete')) { this.deleteSave(button.dataset.saveDelete,button.dataset.saveLabel); return; }
      this.loadSave(button.dataset.saveId);
    });
    document.querySelector('#tasks-toggle').addEventListener('click',() => { if (!this.busy) void this.view.openTasks(); });
    document.querySelector('#tasks-close').addEventListener('click',() => this.view.tasks.close());
    document.querySelector('#terminal-toggle').addEventListener('click',() => { if (!this.busy) void this.view.openTerminal(); });
    document.querySelector('#terminal-close').addEventListener('click',() => { void this.view.closeTerminal(); });
    document.querySelector('#skip-typing').addEventListener('click',() => this.view.terminal.writer.skip());
    document.querySelector('#terminal-content').addEventListener('change',event => {
      if (event.target.id === 'language-select') {
        i18n.setLanguage(event.target.value); this.view.terminal.renderSettings();
        this.showMenu();
        i18n.translate(document.querySelector('#app'));
        i18n.translate(document.querySelector('#terminal'));
      } else if (event.target.id === 'audio-volume') {
        this.view.config.volume = Number(event.target.value); this.view.terminal.volume = this.view.config.volume;
        this.view.music?.setVolume(this.view.config.volume);
      } else this.view.terminal.updateSelection();
    });
    document.querySelector('#terminal-content').addEventListener('submit',event => {
      if (event.target.id !== 'loadout-form') return;
      event.preventDefault();
      const ids = new FormData(event.target).getAll('tool');
      const mode=event.target.querySelector('[name=snapshot]')?.value ?? 'current';
      void this.startMission(ids,mode);
    });
    document.querySelector('#tasks-content').addEventListener('click',event => {
      const target = event.target.closest('button[data-action]');
      if (!target || target.disabled || this.busy) return;
      const {action,id} = target.dataset;
      if (action === 'concurrent') { void this.commit(() => this.model.chooseConcurrent(target.dataset.instance,id),{keepTasksOpen:true}); return; }
      if (action === 'emergency_clean') { void this.commit(() => this.model.chooseEmergencyClean(id),{keepTasksOpen:true}); return; }
      if (action === 'expedition') { void this.commit(() => this.model.planExpedition(id),{keepTasksOpen:true}); return; }
      if (action === 'robot-sample') { void this.commit(() => this.model.collectWithRobot(),{keepTasksOpen:true}); return; }
      if (action === 'work') {
        const state = this.model.snapshot;
        if (state && eventResolved(state,this.model.events.get(state.currentEventId))) void this.commit(() => this.model.work(id),{keepTasksOpen:true});
      }
      else if (action === 'choose') {
        const state = this.model.snapshot;
        const choice = this.model.events.get(state.currentEventId).choices.find(choice => choice.id === id);
        if (choice) void this.commit(() => this.model.choose(id),{keepTasksOpen:true});
      }
    });
    document.querySelector('#tasks-content').addEventListener('change',event => {
      if (event.target.id === 'expedition-check' && !event.target.checked && this.model.snapshot?.expeditionPlan && !this.busy) {
        void this.commit(() => this.model.planExpedition(null),{keepTasksOpen:true});
      }
    });
    const handleDecision = event => {
      const target = event.target.closest('button[data-action]');
      if (!target || target.disabled || this.busy) return;
      const {action,id} = target.dataset;
      if(action==='replay' && this.model.snapshot?.outcome && this.snapshots && ['case-mars-impact','case-mars-glancing'].includes(id)) { void this.startMission(Object.keys(this.model.snapshot.tools),id);return; }
      if (action === 'lights') { void this.toggleLights(); return; }
      const commands = {emergency_clean:() => this.model.chooseEmergencyClean(id),next:() => this.model.nextSol(),battery:() => this.model.useBattery()};
      if (commands[action]) void this.commit(commands[action],{morning:action === 'next',keepTerminal:action !== 'next'});
    };
    document.querySelector('#terminal-content').addEventListener('click',handleDecision);
    document.querySelector('#restart').addEventListener('click',() => {
      if (this.busy) return;
      void this.view.closeTerminal().then(() => {
        this.showMenu();
      });
    });
    document.querySelector('#reduce-motion').addEventListener('change',event => { void this.view.reduceMotion(event.target.checked); });
  }
  render(options) {
    const state = this.model.snapshot;
    return this.view.render(state,state ? this.model.events.get(state.currentEventId) : null,options);
  }
  async commit(command,{morning=false,initial=false,save=true,keepTasksOpen=false,keepTerminal=false}={}) {
    if (this.busy) return;
    this.busy = true; const before = this.model.snapshot;
    try {
      command();
    } catch (error) { this.model.restore(before); this.view.notify(error.message); this.busy = false; return; }
    // 规则确认后立刻保存；动画和图片加载不能撤销已经作出的决定。
    const result = save ? this.repository.save(this.model.snapshot,this.activeSaveId) : {ok:true};
    if (save && result.ok) this.activeSaveId = result.id;
    if (morning) this.view.startTransitionAudio(before);
    try {
      const visual=this.model.snapshot?.visualAction;
      if (visual && visual.id!==before?.visualAction?.id) this.view.presentActivity?.(visual);
      if (keepTerminal && this.view.terminal.dialog.open && this.view.terminal.isConsole) {
        await this.view.refreshTerminal(this.model.snapshot,this.model.events.get(this.model.snapshot.currentEventId));
        if (!result.ok) this.view.notify(result.message);
        return;
      }
      this.view.menu.closeSaves();
      if (!keepTasksOpen) this.view.tasks.close();
      await this.view.closeTerminal();
      this.view.menu.hide();
      await this.render({morning,initial});
      if (!result.ok) this.view.notify(result.message);
    } catch (error) {
      this.view.notify(`画面更新失败，任务决定已保留：${error.message}`);
      document.querySelector('#morning-veil').style.pointerEvents = 'none';
      document.querySelector('#morning-veil').style.opacity = '0';
      document.querySelector('#terminal-toggle').disabled = false;
      document.querySelector('#tasks-toggle').disabled = !this.model.snapshot;
    } finally { this.busy = false; }
  }
}
