# Languages

Default language: `en`. Language selection is saved under `outpost.language` independently of game saves.

- `en.json`: English strings for UI, event text, choices, actions, tools, and narrative summaries.
- `zh-CN.json`: Simplified Chinese strings with the same keys.
- `languages.json`: language codes and native display names used by Settings.

To add a language, copy the English catalog to `<code>.json`, translate its values, and add the code/name to `languages.json`. Missing entries fall back to English.

All catalog keys are English semantic identifiers, such as `action.grow.narrative`, `tool.battery.name`, and `event.arrival.text`. Keep the same keys in every language; edit only the translated values when changing wording. Content JSON, game rules, errors, and new narrative summaries reference these keys instead of using Chinese text as identifiers.

In JavaScript, render text with `i18n.t('action.grow.narrative')`. Static HTML uses `data-i18n="terminal.showFullText"` for text and `data-i18n-aria-label="terminal.open"` for accessibility labels; these attributes retain the key when the player changes languages.

Old saved summaries containing Chinese text are still displayed through a compatibility lookup built from the Chinese narrative values. Unrecognized legacy text is preserved verbatim. New summaries store semantic keys. Game state and event IDs are independent of language; switching language does not restart or change a mission.
