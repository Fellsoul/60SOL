// Keep vowel signs, combining accents and joined characters together while typing.
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined,{granularity:'grapheme'}) : null;

export function textCharacters(value) {
  const text = String(value);
  return segmenter ? Array.from(segmenter.segment(text),part => part.segment) : Array.from(text);
}
