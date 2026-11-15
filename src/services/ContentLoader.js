export async function loadContent() {
  const names = ['events','tools','scene_layout','environment','presentation','resource_log','movement','space_data'];
  const values = await Promise.all(names.map(async name => {
    const response = await fetch(new URL(`../../data/${name}.json`,import.meta.url));
    if (!response.ok) throw new Error(`无法加载 ${name}.json（${response.status}）`);
    return response.json();
  }));
  const content = Object.fromEntries(names.map((name,index) => [name,values[index]]));
  for (const event of content.events) {
    if (!event.endingSummary) throw new Error(`事件 ${event.id} 缺少 endingSummary`);
    if (!event.summaryLine || event.choices.some(choice => !choice.summaryLine)) throw new Error(`事件 ${event.id} 缺少 summaryLine`);
  }
  return content;
}
