import { SceneAssets } from './SceneAssets.js';
import { sceneState, layerState } from './SceneState.js';

export class SceneView {
  constructor(root,layout) {
    this.root = root; this.layout = layout; this.assets = new SceneAssets(); this.layers = [];
    this.reducedMotion = false; this.generation = 0;
    this.onVisibility = () => { this.layers.forEach(layer => this.stop(layer)); if (!document.hidden) this.layers.forEach(layer => this.animate(layer)); };
  }
  async mount() {
    this.root.replaceChildren();
    // All layers share the interior base's original canvas and scale together.
    const base = await this.assets.load(this.layout.canvas.referenceImage);
    const canvas = base ? {width:base.naturalWidth,height:base.naturalHeight} : this.layout.canvas;
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
      this.root.append(node);
      this.layers.push({config,node,key:null,frames:[],timer:null,frameIndex:0});
    }
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
        const frames = await this.assets.state(config);
        if (generation !== this.generation) return; // 丢弃过时的异步加载。
        this.stop(layer); layer.node.replaceChildren(); layer.key = key; layer.frames = frames; layer.frameIndex = 0;
        layer.node.dataset.state = key;
        layer.node.hidden = !frames.length;
        if (frames.length) {
          layer.image = document.createElement('img'); layer.image.alt = ''; layer.image.draggable = false;
          layer.image.src = frames[0].src; layer.node.append(layer.image);
        }
      }
      if (generation !== this.generation) return;
      layer.playback = config;
      this.stop(layer); this.animate(layer);
    }));
  }
  animate(layer) {
    if (!layer.frames.length) return;
    if (this.reducedMotion) { layer.frameIndex = 0; layer.image.src = layer.frames[0].src; return; }
    if (layer.frames.length < 2 || document.hidden) return;
    const count = layer.frames.length;
    const pingPong = layer.playback?.playback !== 'loop';
    const period = pingPong ? count*2-2 : count;
    let tick = layer.frameIndex;
    layer.timer = setInterval(() => {
      tick = (tick+1)%period;
      layer.frameIndex = pingPong && tick >= count ? period-tick : tick;
      layer.image.src = layer.frames[layer.frameIndex].src;
    },1000/Math.max(1,Math.min(24,layer.playback?.fps ?? 6)));
  }
  stop(layer) { clearInterval(layer.timer); layer.timer = null; }
  dispose() { this.generation++; this.layers.forEach(layer => this.stop(layer)); window.removeEventListener('resize',this.resize); document.removeEventListener('visibilitychange',this.onVisibility); }
}
