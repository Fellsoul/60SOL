import { i18n } from '../services/I18n.js';
import { textCharacters } from './TextSegments.js';

const asset = name => new URL(`../../assets/scene/init_game/${name}`,import.meta.url).href;

// Presentation only: setup and the saved mission remain independent of these timers.
export class LaunchIntroView {
  constructor(config) {
    this.config = config;
    this.root = document.querySelector('#launch-intro');
    this.background = this.root.querySelector('.intro-background');
    this.rocket = this.root.querySelector('.intro-rocket');
    this.camera = this.root.querySelector('.intro-camera');
    this.text = this.root.querySelector('.intro-text');
    this.announcement = this.root.querySelector('.intro-announcement');
    this.skipButton = this.root.querySelector('.intro-skip');
    this.whiteout = this.root.querySelector('.intro-whiteout');
    this.blackout = this.root.querySelector('.intro-blackout');
    this.pending = new Set();
    this.animations = new Set();
    this.session = 0;
    this.skipButton.addEventListener('click',() => this.skip());
    window.addEventListener('resize',() => { this.sizeCamera(); this.fitSlogan(); });
  }
  sizeCamera() {
    // A square covering roughly one tenth of the scene, at every aspect ratio.
    this.camera.style.width = `${Math.sqrt(innerWidth*innerHeight*.1)}px`;
  }
  fitSlogan() {
    if (this.transitioning) return;
    if (typeof getComputedStyle !== 'function' || !this.sloganText || !this.text.classList.contains('intro-slogan')) return;
    this.text.style.setProperty('--intro-slogan-fit','999px');
    if (!this.text.clientWidth) return;
    const style = getComputedStyle(this.text);
    const measure = document.createElement('span');
    measure.textContent = this.sloganText;
    measure.setAttribute('aria-hidden','true');
    Object.assign(measure.style,{position:'absolute',visibility:'hidden',whiteSpace:'pre',font:style.font,letterSpacing:style.letterSpacing});
    this.root.appendChild(measure);
    const width = measure.getBoundingClientRect().width;
    measure.remove();
    if (width > this.text.clientWidth) {
      this.text.style.setProperty('--intro-slogan-fit',`${parseFloat(style.fontSize)*(this.text.clientWidth-2)/width}px`);
    }
  }
  start(reducedMotion = false) {
    this.stop();
    const session = ++this.session;
    this.active = true;
    this.skipped = false;
    this.textStarted = false;
    this.reducedMotion = reducedMotion;
    this.transitioning = false;
    this.root.hidden = false;
    this.sizeCamera();
    this.root.classList.remove('intro-cruising');
    this.root.style.setProperty('--intro-space',`url("${asset('space_background.png')}")`);
    document.body.classList.add('launch-intro-active');
    this.skipButton.hidden = true;
    this.skipButton.textContent = i18n.t('intro.skip');
    this.text.textContent = '';
    this.text.classList.remove('intro-slogan');
    this.announcement.textContent = '';
    this.text.style.opacity = '0';
    this.text.style.transform = '';
    this.whiteout.style.opacity = '0';
    this.blackout.style.opacity = '0';
    this.background.style.transform = reducedMotion ? 'translateY(0)' : 'translateY(calc(100dvh - 100%))';
    this.load(this.rocket,asset('rocket_launch.gif'));
    this.load(this.camera,asset('camera_pip.gif'));
    this.scrollFinished = this.load(this.background,asset('space_background.png')).then(async () => {
      if (!this.active || session !== this.session || this.skipped) return;
      if (!this.reducedMotion) await this.animate(this.background,[
        {transform:'translateY(calc(100dvh - 100%))'}, {transform:'translateY(0)'}
      ],this.config.scrollMs);
      if (!this.active || session !== this.session || this.skipped) return;
      this.background.style.transform = 'translateY(0)';
      this.root.classList.add('intro-cruising');
    });
  }
  load(node,src) {
    node.hidden = false;
    return new Promise(resolve => {
      const finish = () => {
        node.onload = node.onerror = null;
        this.pending.delete(finish);
        resolve();
      };
      this.pending.add(finish);
      node.onload = finish;
      node.onerror = () => { node.hidden = true; finish(); };
      node.src = src;
    });
  }
  wait(ms) {
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timer); this.pending.delete(finish); resolve(); };
      const timer = setTimeout(finish,ms);
      this.pending.add(finish);
    });
  }
  async animate(node,frames,duration) {
    const animation = node.animate(frames,{duration,easing:'linear',fill:'forwards'});
    this.animations.add(animation);
    try { await animation.finished; } catch { /* Skip/cancel settles the same presentation promise. */ }
    this.animations.delete(animation);
    animation.cancel();
  }
  typingDelay(previous = '') {
    const base = this.config.typingCharMs ?? 100;
    const variation = this.config.typingVariation ?? .35;
    const pause = this.config.typingPauseMs ?? 240;
    let delay = base * (1 + (Math.random()*2-1)*variation);
    // Keep words flowing, with a little thought between words and at punctuation.
    if (/[,.!?;:…]/u.test(previous)) {
      const weight = /[.!?…]/u.test(previous) ? 1 : .6;
      delay += pause * weight * (.75+Math.random()*.5);
    } else if (/\s/u.test(previous) && Math.random() < (this.config.typingPauseChance ?? .12)) {
      delay += pause * (.5+Math.random());
    }
    return Math.max(1,delay);
  }
  async finishSetup() {
    if (!this.active) return;
    const session = this.session;
    const running = () => this.active && !this.skipped && session === this.session;
    this.textStarted = true;
    this.skipButton.hidden = false;
    this.skipButton.focus({preventScroll:true});
    const copy = this.config.translations?.[i18n.language]?.lines ?? this.config.lines;
    const lines = copy.map(textCharacters);
    const playLines = async () => {
      for (const [lineIndex,characters] of lines.entries()) {
        if (!running()) return;
        this.text.textContent = '';
        this.text.classList.remove('intro-slogan');
        if (lineIndex === 2) this.text.classList.add('intro-slogan');
        // Size against the complete slogan so its font stays steady while typing.
        this.text.style.setProperty('--intro-slogan-characters',String(Math.max(1,characters.length)));
        this.sloganText = characters.join('');
        this.fitSlogan();
        this.announcement.textContent = characters.join('');
        this.text.style.opacity = '1';
        for (let index=0; index<characters.length && !this.reducedMotion; index++) {
          await this.wait(this.typingDelay(characters[index-1]));
          if (!running()) return;
          this.text.textContent = characters.slice(0,index+1).join('');
        }
        if (!running()) return;
        this.text.textContent = characters.join('');
        if (lineIndex === 2) {
          // Hold the complete slogan before enlarging it into the ending transition.
          await Promise.all([this.wait(this.config.lineHoldMs),this.scrollFinished]);
          if (!running()) return;
          await this.expandSlogan(running);
          return;
        }
        await this.wait(this.config.lineHoldMs);
        if (!running()) return;
        if (!this.reducedMotion) await this.animate(this.text,[{opacity:1},{opacity:0}],this.config.lineFadeMs);
        if (!running()) return;
        this.text.style.opacity = '0';
        this.text.textContent = '';
      }
    };
    await Promise.all([this.scrollFinished,playLines()]);
  }
  async expandSlogan(running) {
    this.transitioning = true;
    if (!this.reducedMotion) {
      const lineHeight = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(this.text).lineHeight) : 40;
      const scale = Math.max(24,innerHeight/Math.max(1,lineHeight)*3);
      const transform = `translate(-50%,-50%) scale(${scale})`;
      await Promise.all([
        this.animate(this.text,[{transform:'translate(-50%,-50%) scale(1)'},{transform}],this.config.sloganZoomMs ?? 1800),
        this.animate(this.whiteout,[{opacity:0},{opacity:0,offset:.65},{opacity:1}],this.config.sloganZoomMs ?? 1800)
      ]);
      if (!running()) return;
      this.text.style.transform = transform;
      this.whiteout.style.opacity = '1';
      await this.animate(this.blackout,[{opacity:0},{opacity:1}],this.config.whiteToBlackMs ?? 650);
      if (!running()) return;
    }
    this.blackout.style.opacity = '1';
  }
  clearPending() {
    for (const finish of [...this.pending]) finish();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }
  setReducedMotion(value) {
    this.reducedMotion = value;
    if (value && this.active) {
      for (const animation of this.animations) animation.cancel();
      this.background.style.transform = 'translateY(0)';
    }
  }
  skip() {
    if (!this.active || !this.textStarted) return;
    this.skipped = true;
    this.clearPending();
    this.text.textContent = '';
    this.announcement.textContent = '';
    this.skipButton.hidden = true;
  }
  stop() {
    this.active = false;
    this.session++;
    this.clearPending();
    this.root.hidden = true;
    this.skipButton.hidden = true;
    document.body.classList.remove('launch-intro-active');
    for (const node of [this.background,this.rocket,this.camera]) node.removeAttribute('src');
  }
}
