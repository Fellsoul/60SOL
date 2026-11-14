// Missing or stalled art falls back safely; refreshing retries failed files.
export class SceneAssets {
  constructor({timeoutMs=3000,imageFactory=()=>new Image(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}) {
    this.cache=new Map();this.missing=new Set();
    this.timeoutMs=timeoutMs;this.imageFactory=imageFactory;this.schedule=schedule;this.cancel=cancel;
  }
  load(url) {
    if (!url) return Promise.resolve(null);
    if (!this.cache.has(url)) {
      this.cache.set(url,new Promise(resolve=> {
        let image;
        try { image=this.imageFactory(); }
        catch { this.missing.add(url);resolve(null);return; }
        let settled=false,timer=null;
        const finish=asset=> {
          if (settled) return;
          settled=true;
          if (timer!==null) this.cancel(timer);
          image.onload=null;image.onerror=null;
          if (!asset) this.missing.add(url);
          resolve(asset);
        };
        image.onload=()=>finish(image);
        image.onerror=()=>finish(null);
        timer=this.schedule(()=>finish(null),this.timeoutMs);
        image.src=url;
      }));
    }
    return this.cache.get(url);
  }
  async state(config) {
    if (!config || config.hidden) return null;
    return this.load(config.src);
  }
}
