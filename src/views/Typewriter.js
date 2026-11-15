// 独立的表现计时器：取消或跳过绝不推进游戏。
import { resourceTokens } from './ResourceIcons.js';
export class Typewriter {
  constructor() { this.timer = null; this.finish = null; }
  cancel() { clearTimeout(this.timer); this.timer = null; this.finish = null; }
  play(jobs, { reducedMotion = false, onComplete = () => {} } = {}) {
    this.cancel();
    const remaining = jobs.map(({node,text,after=[]}) => ({node,text:resourceTokens(text),after,index:0}));
    remaining.forEach(job => { job.node.textContent = ''; job.after.forEach(node => { node.hidden=true; }); });
    const finish = () => {
      clearTimeout(this.timer);
      remaining.forEach(job => { job.node.innerHTML = job.text.join(''); job.node.classList.remove('typing'); job.after.forEach(node => { node.hidden=false; }); });
      this.finish = null; onComplete();
    };
    this.finish = finish;
    if (reducedMotion) { finish(); return; }
    let current = 0;
    const tick = () => {
      const job = remaining[current];
      if (!job) { finish(); return; }
      job.node.classList.add('typing');
      job.index = Math.min(job.index + 2,job.text.length);
      job.node.innerHTML = job.text.slice(0,job.index).join('');
      if (job.index === job.text.length) { job.node.classList.remove('typing'); job.after.forEach(node => { node.hidden=false; }); current += 1; }
      this.timer = setTimeout(tick,28);
    };
    tick();
  }
  skip() { this.finish?.(); }
}
