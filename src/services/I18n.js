export class I18n {
  async init() {
    const response = await fetch('locales/languages.json');
    this.languages = await response.json(); this.catalogs = {};
    await Promise.all(this.languages.map(async ({code}) => {
      const result = await fetch(`locales/${code}.json`);
      if (!result.ok) throw new Error(`Language unavailable: ${code}`);
      this.catalogs[code] = await result.json();
    }));
    let saved; try { saved = localStorage.getItem('outpost.language'); } catch {}
    this.setLanguage(saved || 'en');
  }
  setLanguage(code) {
    this.language = this.catalogs[code] ? code : 'en'; document.documentElement.lang = this.language;
    try { localStorage.setItem('outpost.language',this.language); } catch {}
  }
  t(key) { return this.catalogs[this.language]?.[key] ?? this.catalogs.en?.[key] ?? key; }
  // Translate authored text and accessibility labels before the typewriter starts.
  translate(root) {
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode; const key = node.textContent.trim();
      if (key) node.textContent = node.textContent.replace(key,this.t(key));
    }
    root.querySelectorAll('[data-copy],[aria-label]').forEach(node => {
      for (const attr of ['data-copy','aria-label']) if (node.hasAttribute(attr)) node.setAttribute(attr,this.t(node.getAttribute(attr)));
    });
  }
}
export const i18n = new I18n();
