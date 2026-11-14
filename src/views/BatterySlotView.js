import { LIMITS } from '../models/state.js';

// Consume batteries top to bottom, and lamps right to left within each battery.
export function batteryLights(energy) {
  const missing = LIMITS.energy - Math.max(0,Math.min(LIMITS.energy,Math.floor(energy)));
  return Array.from({length:3},(_,row) => Array.from({length:4},(_,column) => row*4 + 3-column >= missing));
}

export class BatterySlotView {
  constructor() {
    this.slots = ['terminal-toggle','terminal'].map((id,index) => {
      const node = document.createElement('div'); node.className = 'terminal-battery-slot';
      node.hidden = true; node.setAttribute('role','img');
      const prefix = `battery-slot-${index}`;
      // Clip grayscale copies of the original image to the lamps and their glow.
      const lamps = [321,548,771].flatMap(y => [725,842,959,1075].map(x => ({x,y})));
      node.innerHTML = `<svg viewBox="0 0 1536 1024" aria-hidden="true">
        <defs><filter id="${prefix}-gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="0.55"/><feFuncG type="linear" slope="0.55"/><feFuncB type="linear" slope="0.55"/></feComponentTransfer></filter>
        ${lamps.map(({x,y},i) => `<clipPath id="${prefix}-lamp-${i}"><rect x="${x-56}" y="${y-31}" width="112" height="62" rx="12"/></clipPath>`).join('')}</defs>
        <image href="assets/terminal_battery_slot.png" width="1536" height="1024"/>
        ${lamps.map((_,i) => `<g data-battery-lamp="${i}" clip-path="url(#${prefix}-lamp-${i})"><image href="assets/terminal_battery_slot.png" width="1536" height="1024" filter="url(#${prefix}-gray)"/></g>`).join('')}
      </svg>`;
      document.getElementById(id).append(node);
      return node;
    });
  }
  render(state) {
    const lights = state ? batteryLights(state.energy).flat() : [];
    for (const node of this.slots) {
      node.hidden = !state;
      if (!state) continue;
      node.setAttribute('aria-label',`${state.energy} / ${LIMITS.energy} E`);
      node.dataset.energy = state.energy;
      node.querySelectorAll('[data-battery-lamp]').forEach((lamp,index) => {
        lamp.style.display = lights[index] ? 'none' : '';
        lamp.dataset.lit = String(lights[index]);
      });
    }
  }
}
