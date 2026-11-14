import { SceneEventView } from './SceneEventView.js';
import { SceneView } from './SceneView.js';
import { TaskView } from './TaskView.js';
import { TerminalView } from './TerminalView.js';
import { MenuView } from './MenuView.js';
import { TransitionAudio } from './TransitionAudio.js';
import { i18n } from '../services/I18n.js';

export class GameView {
  constructor(content) {
    this.config = content.presentation; this.menu = new MenuView(this.config.menu); this.audio = new TransitionAudio(this.config);
    this.scene = new SceneView(document.querySelector('#scene'),content.scene_layout);
    this.terminal = new TerminalView(content.tools,content.events,content.resource_log);
    this.tasks = new TaskView();
    this.tasks.events = content.events;
    this.events = content.events;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('#reduce-motion').checked = this.reducedMotion;
    this.state = null; this.event = null;
    i18n.translate(document.querySelector('#terminal')); i18n.translate(document.querySelector('#app'));
    document.body.classList.toggle('reduced-motion',this.reducedMotion);
    window.addEventListener('pagehide',() => this.audio.stop());
  }
  async mount() {
    await this.scene.mount();
    this.tasks.mount();
    this.sceneEvent = new SceneEventView(this.scene.root);
    this.sceneEvent.events = this.events;
  }
  coverScene() {
    const veil = document.querySelector('#morning-veil');
    const title = document.querySelector('#sol-title');
    veil.style.opacity = '1'; veil.style.pointerEvents = 'auto';
    title.style.opacity = '0';
  }
  notify(message) {
    const notice = document.querySelector('#notice');
    clearTimeout(this.noticeTimer); notice.textContent = i18n.t(message); notice.hidden = !message;
    if (message) this.noticeTimer = setTimeout(() => { notice.hidden = true; },8000);
  }
  async render(state,event,{morning=false,initial=false}={}) {
    this.state = state; this.event = event;
    const veil = document.querySelector('#morning-veil');
    const title = document.querySelector('#sol-title');
    const toggle = document.querySelector('#terminal-toggle'); toggle.disabled = true;
    document.querySelector('#tasks-toggle').disabled = true;
    if (morning || initial) {
      this.tasks.close();
      await this.terminal.close(); veil.style.pointerEvents = 'auto';
      // Keep the title invisible throughout both scene fades.
      title.style.opacity = '0';
      title.textContent = state ? `SOL ${String(state.sol).padStart(3,'0')}` : '';
      if (!initial) await this.fade(veil,0,1,this.config.fadeInMs);
      else veil.style.opacity = '1';
    }
    await this.scene.render(state,this.reducedMotion);
    this.terminal.render(state,event);
    this.tasks.render(state,event);
    this.sceneEvent?.render(state,event,{reset:initial});
    if (morning || initial) {
      // The black layer stays fully opaque while the title animates independently.
      if (state) await this.fade(title,0,1,this.config.titleFadeInMs ?? 700);
      if (!this.reducedMotion) await new Promise(resolve => setTimeout(resolve,this.config.blackHoldMs));
      if (state) await this.fade(title,1,0,this.config.titleFadeOutMs ?? 700);
      await Promise.all([this.fade(veil,1,0,this.config.fadeOutMs),this.audio.finish()]); veil.style.pointerEvents = 'none';
    }
    toggle.disabled = false;
    document.querySelector('#tasks-toggle').disabled = !state;
  }
  async fade(node,from,to,duration) {
    const animation = node.animate([{opacity:from},{opacity:to}],{duration:this.reducedMotion ? 0 : duration,easing:'ease-in-out',fill:'forwards'});
    await animation.finished; node.style.opacity = to; animation.cancel();
  }
  openTerminal() { this.tasks.close(); return this.terminal.open(this.state,this.event,this.reducedMotion); }
  async openTasks() { await this.terminal.close(); if (this.state) this.tasks.open(); }
  async closeTerminal() { await this.terminal.close(); }
  async refreshTerminal(state,event) {
    this.state = state; this.event = event;
    await this.terminal.fadeContentOut(this.reducedMotion);
    await this.scene.render(state,this.reducedMotion);
    this.tasks.render(state,event);
    this.sceneEvent?.render(state,event);
    this.terminal.render(state,event,{autoplay:false});
    this.terminal.typeContent(this.reducedMotion);
  }
  async reduceMotion(value) {
    document.body.classList.toggle('reduced-motion',value);
    this.reducedMotion = value; this.terminal.setReducedMotion(value);
    await this.scene.render(this.state,value);
  }
  startTransitionAudio(previousState) {
    // Called synchronously inside a user gesture, before awaiting modal animations.
    const recap = previousState?.phase === 'end' ? this.config.recaps[previousState.currentEventId] : null;
    const src = typeof recap === 'string' ? recap : recap?.[i18n.language];
    this.audio.start(src || this.config.ambient);
  }
}
