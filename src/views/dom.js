// 动态文本统一转义；不将存档、JSON 文本直接拼成可执行 HTML。
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
export function button(action, id, label, description = '', disabled = false, className = 'choice') {
  return `<button class="${className}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}><span>${escapeHtml(label)}</span>${description ? `<small>${escapeHtml(description)}</small>` : ''}</button>`;
}
