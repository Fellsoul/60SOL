// 将唯一 Model 状态投影为素材状态名；纯函数，不改变游戏或保存第二套库存。
export function sceneState(state) {
  if (!state) return { always:'visible', weather:'clear', lighting:'on', plants:'seed', crew:'seated', panels:'clean', transmission:'idle', tools:{} };
  return {
    always: 'visible',
    weather: state.weather,
    lighting: state.lightsOn && state.lifeSupportPaid && state.energy > 0 ? 'on' : 'off',
    plants: state.plantStage,
    crew: state.health < 45 ? 'exhausted' : state.workId === 'rest' ? 'resting' : 'seated',
    panels: state.dusty ? 'dusty' : 'clean',
    transmission: state.pendingData > 0 ? 'sending' : state.localData > 0 ? 'stored' : state.sentData > 0 ? 'received' : 'idle',
    tools: state.tools,
  };
}

export function layerState(layer, appearance) {
  const value = layer.bind.split('.').reduce((object,key) => object?.[key],appearance);
  return value ?? layer.defaultState;
}
