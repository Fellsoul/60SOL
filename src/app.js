import { loadContent } from './services/ContentLoader.js';
import { GameModel } from './models/GameModel.js';
import { SaveRepository } from './repositories/SaveRepository.js';
import { GameView } from './views/GameView.js';
import { GameController } from './controllers/GameController.js';
import { i18n } from './services/I18n.js';

// Composition root：只创建依赖并启动，不写游戏规则或 DOM 模板。
async function bootstrap() {
  await i18n.init();
  const content = await loadContent();
  let storage = null;
  try { storage = window.localStorage; } catch { /* 禁用存储时仍允许当局游玩。 */ }
  const model = new GameModel(content);
  const repository = new SaveRepository(storage,content);
  const view = new GameView(content);
  await view.mount();
  const controller = new GameController(model,view,repository);
  await controller.start();
}

bootstrap().catch(error => {
  document.querySelector('#notice').hidden = false;
  document.querySelector('#morning-veil').style.opacity = '0';
  document.querySelector('#morning-veil').style.pointerEvents = 'none';
  document.querySelector('#notice').textContent = `启动失败：${error.message}。请通过静态 HTTP 服务打开，并检查 data/ 与素材路径。`;
  console.error(error);
});
