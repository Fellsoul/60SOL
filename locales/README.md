# Languages

Default language: `en`. Language selection is saved under `outpost.language` independently of game saves.

- `en.json`: English strings for UI, event text, choices, actions, tools, and narrative summaries.
- `zh-CN.json`: Simplified Chinese strings with the same keys.
- `languages.json`: language codes and native display names used by Settings.

To add a language, copy the English catalog to `<code>.json`, translate its values, and add the code/name to `languages.json`. Missing entries fall back to English.

Existing authored Chinese strings serve as translation keys for compatibility with saved narrative summaries. New menu/settings strings use semantic keys. When changing an authored source string, update both catalogs. Game state and event IDs are independent of language; switching language does not restart or change a mission.
