import { MovementDirector } from './MovementDirector.js';

export class MovementView {
  constructor(config = {}, scene = null) {
    this.scene = scene;
    this.queued = null;
    this.queuedReduced = false;
    this.director = new MovementDirector({
      onFrame: frame => this.scene?.crewMotion.react(frame)
    });
    this.visibility = () => {
      if (document.hidden) this.skip();
    };
    document.addEventListener('visibilitychange', this.visibility);
    this.observer = new MutationObserver(() => this.playQueued());
    for (const dialog of document.querySelectorAll('#terminal,#tasks')) {
      this.observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    }
  }

  present(plan, reducedMotion) {
    if (document.querySelector('#tasks[open],#terminal[open]') && !reducedMotion) {
      this.queued = plan;
      this.queuedReduced = reducedMotion;
      return;
    }
    this.queued = null;
    try {
      this.director.present(plan, { reducedMotion, hidden: document.hidden });
    } catch {
      this.director.restore(plan);
    }
  }

  playQueued() {
    if (this.queued && !document.querySelector('#tasks[open],#terminal[open]')) {
      const plan = this.queued;
      this.queued = null;
      this.present(plan, this.queuedReduced);
    }
  }

  skip() {
    if (this.queued) {
      const plan = this.queued;
      this.queued = null;
      this.director.present(plan, { reducedMotion: true });
    }
    this.director.skip();
  }

  restore(plan) {
    this.queued = null;
    this.director.restore(plan);
  }

  clear() {
    this.queued = null;
    this.scene?.crewMotion.stopReaction();
    this.director.clear();
  }

  dispose() {
    this.director.dispose();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
