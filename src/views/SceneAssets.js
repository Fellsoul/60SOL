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
    if (!config || config.hidden) return null;
    return this.load(config.src);
  }
}
