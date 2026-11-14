import { CrewMotion } from './CrewMotion.js';
import { SceneAssets } from './SceneAssets.js';
import { sceneState, layerState } from './SceneState.js';
import { CrewStatus } from './CrewStatus.js';

export class SceneView {
  constructor(root,layout) {
    this.root = root; this.layout = layout; this.assets = new SceneAssets(); this.layers = [];
    this.reducedMotion = false; this.generation = 0;
    this.crewMotion = new CrewMotion(root);
    this.crewStatus = new CrewStatus(root);
    this.onVisibility = () => { this.layers.forEach(layer => this.animate(layer));this.crewMotion.sync(this.reducedMotion); };
  }
  async mount() {
    this.root.replaceChildren();
    // All layers share the interior base's original canvas and scale together.
    const base = await this.assets.load(this.layout.canvas.referenceImage);
    const canvas = base ? {width:base.naturalWidth,height:base.naturalHeight} : this.layout.canvas;
    this.canvas = canvas;
    const fit = () => {
      const { width,height } = canvas;
      const scale = Math.min(innerWidth/width,innerHeight/height);
      this.root.style.width = `${width*scale}px`; this.root.style.height = `${height*scale}px`;
    };
    this.resize = fit; window.addEventListener('resize',fit); fit();
    document.addEventListener('visibilitychange',this.onVisibility);
    for (const config of this.layout.layers) {
      const node = document.createElement('div'); node.className = 'scene-layer'; node.dataset.layer = config.id;
      node.style.zIndex = config.zIndex;
      // The table source contains baked-in crew outside its foreground footprint.
      if (config.clipPath) node.style.clipPath = config.clipPath;
      if (config.viewport) {
        const {x,y,width,height} = config.viewport;
        Object.assign(node.style,{left:`${x}%`,top:`${y}%`,width:`${width}%`,height:`${height}%`});
        node.classList.add('scene-dust');
      }
      this.root.append(node);
      this.layers.push({config,node,key:null,animation:null});
    }
    this.crewStatus.mount();
    if (new URLSearchParams(location.search).has('debug')) {
      this.root.classList.add('debug');
    }
    await this.render(null,false);
  }
  async render(state,reducedMotion) {
    this.reducedMotion = reducedMotion;
    const generation = ++this.generation;
    const appearance = sceneState(state);
    await Promise.all(this.layers.map(async layer => {
      const key = layerState(layer.config,appearance);
      const config = layer.config.states[key] ?? layer.config.states[layer.config.defaultState];
      if (layer.key !== key) {
        let asset = await this.assets.state(config);
        let renderedKey = key;
        if (!asset && !config?.hidden && key !== layer.config.defaultState) {
          asset = await this.assets.state(layer.config.states[layer.config.defaultState]);
          renderedKey = layer.config.defaultState;
        }
        if (generation !== this.generation) return; // 丢弃过时的异步加载。
        this.stop(layer); layer.node.replaceChildren(); layer.key = key; layer.track = null; layer.drift = null;
        layer.node.dataset.state = key;
        layer.node.dataset.renderedState = renderedKey;
        layer.node.hidden = !asset;
        if (asset) {
          const image = document.createElement('img'); image.alt = ''; image.draggable = false;
          image.src = asset.src;
          if (config.motion) {
            // Two identical tiles make the end of each translation match its start.
            layer.track = document.createElement('div'); layer.track.className = 'scene-dust-track';
            layer.drift = document.createElement('div'); layer.drift.className = 'scene-dust-motion';
            layer.drift.style.opacity = config.opacity ?? 1;
            layer.track.append(image,image.cloneNode()); layer.drift.append(layer.track); layer.node.append(layer.drift);
          } else layer.node.append(image);
        }
      }
      if (generation !== this.generation) return;
      layer.playback = config;
      this.animate(layer);
    }));
    if (generation === this.generation) { this.crewMotion.sync(reducedMotion); this.crewStatus.render(state); }
  }
  animate(layer) {
    if (!layer.track) return;
    if (this.reducedMotion || document.hidden) {
      for (const animation of [layer.animation,layer.variation]) {
        animation?.pause();
        if (this.reducedMotion && animation) animation.currentTime = 0;
      }
      return;
    }
    if (!layer.animation) {
      const {speed = 90,depth = 1,direction = 'left'} = layer.playback.motion;
      // Speed is in original canvas pixels/second; greater depth moves more slowly.
      const distance = this.canvas.width * (layer.config.viewport?.width ?? 100)/100;
      const duration = 1000 * distance * Math.max(0.1,depth)/Math.max(1,speed);
      const frames = [{transform:'translateX(0)'},{transform:'translateX(-50%)'}];
      layer.animation = layer.track.animate(direction === 'right' ? frames.reverse() : frames,
        {duration,iterations:Infinity,easing:'linear'});
    } else if (layer.animation.playState === 'paused') layer.animation.play();
    if (!layer.variation && layer.playback.motion.variation) this.vary(layer);
    else if (layer.variation?.playState === 'paused') layer.variation.play();
  }
  vary(layer) {
    const config = layer.playback.motion.variation;
    const random = (min,max) => min + Math.random()*(max-min);
    const opacity = layer.playback.opacity ?? 0.5;
    const drift = config.driftPercent ?? 1;
    // Enlarge the inner surface so vertical drift never reveals its edges.
    const minScale = Math.max(config.scaleMin ?? 1.04,1 + 2*drift/100 + 0.005);
    const maxScale = Math.max(minScale,config.scaleMax ?? 1.16);
    const base = {opacity,transform:`translateY(0%) scale(${minScale})`,easing:'ease-in-out'};
    const sample = opacity => ({opacity,
      transform:`translateY(${random(-drift,drift)}%) scale(${random(minScale,maxScale)})`,easing:'ease-in-out'});
    const frames = [base,
      {...sample(random(config.opacityMin ?? 0.3,opacity)),offset:random(0.25,0.35)},
      {...sample(random(opacity,config.opacityMax ?? 0.7)),offset:random(0.65,0.75)},base];
    const animation = layer.drift.animate(frames,{
      duration:random(config.durationMinMs ?? 3500,config.durationMaxMs ?? 7000),fill:'both'
    });
    layer.variation = animation;
    animation.onfinish = () => {
      if (layer.variation !== animation) return;
      // Keep the shared endpoint while replacing this breath with a fresh random one.
      layer.drift.style.transform = base.transform;
      animation.cancel(); layer.variation = null;
      this.animate(layer);
    };
  }
  stop(layer) {
    if (layer.variation) { layer.variation.onfinish = null; layer.variation.cancel(); }
    layer.animation?.cancel(); layer.animation = null; layer.variation = null;
  }
  dispose() { this.crewMotion.dispose();this.generation++; this.layers.forEach(layer => this.stop(layer)); window.removeEventListener('resize',this.resize); document.removeEventListener('visibilitychange',this.onVisibility); }
}
