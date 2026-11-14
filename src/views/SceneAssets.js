// 只读取用户提供的 PNG；缺失素材不生成占位图。刷新页面后会重新读取。
export class SceneAssets {
  constructor() { this.cache = new Map(); this.missing = new Set(); }
  load(url) {
    if (!url) return Promise.resolve(null);
    if (!this.cache.has(url)) {
      this.cache.set(url,new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => { this.missing.add(url); resolve(null); };
        image.src = url;
      }));
    }
    return this.cache.get(url);
  }
  async state(config) {
    if (!config || config.hidden) return [];
    let sources = config.frames ?? (config.src ? [config.src] : []);
    if (config.sequence) {
      const { pattern,start = 1,count,pad = 2 } = config.sequence;
      sources = Array.from({length:count},(_,i) => pattern.replace('{index}',String(start+i).padStart(pad,'0')));
    }
    const images = await Promise.all(sources.map(src => this.load(src)));
    if (images.length && images.every(Boolean)) return images;
    // 序列不完整时显示首个可用帧，不将残缺序列当作完整动画播放。
    return images.filter(Boolean).slice(0,1);
  }
}
