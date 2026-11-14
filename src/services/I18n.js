export class I18n {
  constructor(catalogs = {}) { this.language = 'en'; this.setCatalogs(catalogs); }
  setCatalogs(catalogs) {
    this.catalogs = catalogs;
    // Old saves contain Chinese summary text. Resolve it without keeping Chinese catalog keys.
    this.legacyNarrativeKeys = new Map(Object.entries(catalogs['zh-CN'] ?? {})
      .filter(([key]) => key.startsWith('summary.') || key.endsWith('.summary') || key.endsWith('.summaryLine'))
      .map(([key,text]) => [text,key]));
  }
  async init() {
    const response = await fetch('locales/languages.json');
    this.languages = await response.json();
    const catalogs = await Promise.all(this.languages.map(async ({code}) => {
      const result = await fetch(`locales/${code}.json`);
      if (!result.ok) throw new Error(`Language unavailable: ${code}`);
      return [code,await result.json()];
    }));
    this.setCatalogs(Object.fromEntries(catalogs));
    let saved; try { saved = localStorage.getItem('outpost.language'); } catch {}
    this.setLanguage(saved || 'en');
  }
  setLanguage(code) {
    this.language = this.catalogs[code] ? code : 'en'; document.documentElement.lang = this.language;
    try { localStorage.setItem('outpost.language',this.language); } catch {}
  }
  t(key) {
    const resolved = this.legacyNarrativeKeys.get(key) ?? key;
    for (const catalog of [this.catalogs[this.language],this.catalogs.en]) {
      if (catalog && Object.hasOwn(catalog,resolved)) return catalog[resolved];
    }
    return key;
  }
  // Keep the semantic key on each static element so repeated language changes are reversible.
  translate(root) {
    for (const node of [root,...root.querySelectorAll('[data-i18n],[data-i18n-aria-label]')]) {
      if (node.dataset.i18n) node.textContent = this.t(node.dataset.i18n);
      if (node.dataset.i18nAriaLabel) node.setAttribute('aria-label',this.t(node.dataset.i18nAriaLabel));
    }
  }
}
export const i18n = new I18n();
