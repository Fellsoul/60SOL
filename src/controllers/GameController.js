import { i18n } from '../services/I18n.js';
export class GameController {
  constructor(model,view,repository) { this.model = model; this.view = view; this.repository = repository; this.busy = false; }
  async start() {
    const {state,message} = this.repository.load();
    this.savedState = state;
    this.view.menu.show(Boolean(state));
    if (message && !state) this.view.notify(message);
    document.querySelector('#main-menu').addEventListener('click',event => {
      const command = event.target.closest('[data-menu]')?.dataset.menu;
      if (this.busy || !command) return;
      if (command === 'settings') { void this.view.terminal.open(null,null,this.view.reducedMotion,'settings'); return; }
      if (command === 'new') {
        if (this.savedState && !confirm(i18n.t('confirm.new'))) return;
        this.model.restore(null); void this.view.terminal.open(null,null,this.view.reducedMotion); return;
      }
      if (command === 'load' || command === 'continue') {
        const loaded = this.repository.load();
        if (!loaded.state) { this.view.notify(i18n.t('save.unavailable')); return; }
        void this.commit(() => this.model.restore(loaded.state),{morning:true,save:false});
      }
    });
    document.querySelector('#terminal-toggle').addEventListener('click',() => { if (!this.busy) void this.view.openTerminal(); });
    document.querySelector('#terminal-close').addEventListener('click',() => { void this.view.closeTerminal(); });
    document.querySelector('#skip-typing').addEventListener('click',() => this.view.terminal.writer.skip());
    document.querySelector('#terminal-content').addEventListener('change',event => {
      if (event.target.id === 'language-select') {
        i18n.setLanguage(event.target.value); this.view.terminal.renderSettings();
        this.view.menu.show(Boolean(this.savedState));
        document.querySelector('#skip-typing').textContent = i18n.t('显示全文');
        document.querySelector('#restart').textContent = i18n.t('重新开始');
        document.querySelector('#motion-label').textContent = i18n.t('静态显示');
        document.querySelector('#terminal-close').setAttribute('aria-label',i18n.t('关闭终端'));
        document.querySelector('#terminal-toggle').setAttribute('aria-label',i18n.t('打开终端'));
        document.querySelector('#scene').setAttribute('aria-label',i18n.t('火星前哨站内部'));
      } else if (event.target.id === 'audio-volume') {
        this.view.config.volume = Number(event.target.value); this.view.terminal.volume = this.view.config.volume;
      } else this.view.terminal.updateSelection();
    });
    document.querySelector('#terminal-content').addEventListener('submit',event => {
      if (event.target.id !== 'loadout-form') return;
      event.preventDefault();
      const ids = new FormData(event.target).getAll('tool');
      void this.commit(() => this.model.start(ids),{morning:true});
    });
    document.querySelector('#terminal-content').addEventListener('click',event => {
      const target = event.target.closest('button[data-action]');
      if (!target || target.disabled || this.busy) return;
      const {action,id} = target.dataset;
      const commands = {choose:() => this.model.choose(id),work:() => this.model.work(id),next:() => this.model.nextSol(),battery:() => this.model.useBattery()};
      if (commands[action]) void this.commit(commands[action],{morning:action === 'next'});
    });
    document.querySelector('#restart').addEventListener('click',() => {
      if (this.busy) return;
      void this.view.closeTerminal().then(() => {
        this.savedState = this.repository.load().state; this.view.menu.show(Boolean(this.savedState));
      });
    });
    document.querySelector('#reduce-motion').addEventListener('change',event => { void this.view.reduceMotion(event.target.checked); });
  }
  render(options) {
    const state = this.model.snapshot;
    return this.view.render(state,state ? this.model.events.get(state.currentEventId) : null,options);
  }
  async commit(command,{morning=false,save=true}={}) {
    if (this.busy) return;
    this.busy = true; const before = this.model.snapshot;
    try {
      command();
    } catch (error) { this.model.restore(before); this.view.notify(error.message); this.busy = false; return; }
    // 规则确认后立刻保存；动画和图片加载不能撤销已经作出的决定。
    const result = save ? this.repository.save(this.model.snapshot) : {ok:true};
    if (save && result.ok) this.savedState = this.model.snapshot;
    if (morning) this.view.startTransitionAudio(before);
    try {
      await this.view.closeTerminal();
      this.view.menu.hide();
      await this.render({morning});
      if (!result.ok) this.view.notify(result.message);
    } catch (error) {
      this.view.notify(`画面更新失败，任务决定已保留：${error.message}`);
      document.querySelector('#morning-veil').style.pointerEvents = 'none';
      document.querySelector('#morning-veil').style.opacity = '0';
      document.querySelector('#terminal-toggle').disabled = false;
    } finally { this.busy = false; }
  }
}
