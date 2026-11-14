"""终端和素材读取冒烟测试。需要 Playwright + 本机 Edge。

PNG 响应使用内存中的单像素测试样本，不向素材文件夹写入图片。
实际美术构图与纹理接缝需要用户提供素材后另行验收。
"""
import base64
import io
import wave
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'last-light-outpost.save.v1'
PIXEL = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        context.route('**/assets/scene/**/*.png', lambda route: route.continue_() if route.request.url.endswith(('/outpost_console.png', '/outpost_baseMain.png', '/outpost_baseRight.png')) else route.fulfill(status=200, content_type='image/png', body=PIXEL))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def ready():
            page.locator('#terminal-toggle:enabled').wait_for()

        def terminal():
            ready()
            page.locator('#terminal-toggle').click()
            page.locator('#terminal[open]').wait_for()
            assert page.locator('#terminal-scroll').evaluate('(node) => node.scrollTop') == 0
            assert page.locator('.is-console .terminal-shell').evaluate('(node) => node.scrollTop') == 0

        def clipboard():
            ready()
            if page.locator('#terminal[open]').count():
                page.keyboard.press('Escape')
                page.wait_for_function("!document.querySelector('#terminal').open")
            if not page.locator('#tasks[open]').count():
                page.locator('#tasks-toggle').click()
            page.locator('#tasks[open]').wait_for()

        def decide(selector, *, closes=False, appears=None, disappears=None):
            is_work = 'data-action=work' in selector
            if is_work:
                clipboard()
            page.locator(selector).click()
            if is_work:
                page.locator('#tasks .is-complete').wait_for()
                assert page.locator('#tasks[open]').count() == 1
                assert page.locator('#tasks [data-action=next]').count() == 0
                assert page.locator(selector).is_disabled()
            elif closes:
                page.wait_for_function("!document.querySelector('#terminal').open")
                ready()
            else:
                assert page.locator('#terminal').is_visible()
            if appears: page.locator(appears).wait_for()
            if disappears: page.locator(disappears).wait_for(state='detached')

        page.goto(url)
        page.locator('[data-menu=new]').click()
        assert page.locator('progress, #resources, #journal').count() == 0
        page.locator('[value=toolkit]').check()
        page.locator('[value=battery]').check()
        assert page.locator('[value=robot]').is_disabled()
        page.evaluate("""() => {
          window.newSceneRevealOpacity = [];
          new MutationObserver(() => {
            const scene = document.querySelector('#scene-viewport');
            if (!scene.hidden) newSceneRevealOpacity.push(Number(getComputedStyle(document.querySelector('#morning-veil')).opacity));
          }).observe(document.querySelector('#scene-viewport'),{attributes:true,attributeFilter:['hidden']});
        }""")
        decide('#loadout-form button',closes=True)
        assert page.evaluate('newSceneRevealOpacity.length === 1 && newSceneRevealOpacity[0] === 1'), 'New game scene appeared before the black veil'
        collapsed = page.locator('#terminal-toggle').bounding_box()
        assert abs(collapsed['width'] - 1440 * .6) < 1
        assert abs((900-collapsed['y'])/collapsed['height'] - .1) < .01
        clipboard()
        assert page.locator('#tasks [data-action]').count() == 0
        assert page.locator('#tasks [data-action=work]').count() == 0
        page.keyboard.press('Escape')
        assert page.locator('#tasks-toggle').evaluate('(node) => node === document.activeElement')
        terminal()
        expanded = page.locator('#terminal').bounding_box()
        slot = page.locator('#terminal .terminal-battery-slot')
        assert slot.get_attribute('data-energy') == '9'
        assert slot.locator('[data-lit=true]').count() == 9
        slot_bounds = slot.bounding_box()
        assert slot_bounds['x'] > expanded['x'] + expanded['width']*.9
        assert slot_bounds['x']+slot_bounds['width'] <= 1440
        assert abs((900-expanded['y'])/expanded['height'] - .8) < .01
        screen = page.locator('.is-console .terminal-shell').bounding_box()
        assert screen['y'] >= expanded['y'] and screen['y']+screen['height'] <= 900
        page.mouse.click(10, 10)
        page.wait_for_function("!document.querySelector('#terminal').open")
        terminal()
        assert page.locator('#terminal-title').inner_text() == 'SOL 01'
        page.locator('#reduce-motion').uncheck()
        terminal_before = page.locator('#terminal').bounding_box()
        page.locator('[data-action=choose][data-id=grow]').click()
        page.wait_for_function("Number(getComputedStyle(document.querySelector('#terminal-content')).opacity) < .8")
        assert page.locator('#terminal[open]').is_visible()
        page.locator('[data-action=next]').wait_for()
        assert page.locator('.typing').count() > 0
        terminal_after = page.locator('#terminal').bounding_box()
        assert all(abs(terminal_before[key]-terminal_after[key]) < 1 for key in ['x','y','width','height'])
        page.locator('#skip-typing').click()
        page.locator('#reduce-motion').check()
        assert page.locator('#terminal .terminal-battery-slot').get_attribute('data-energy') == '6'
        assert page.locator('[data-layer=plants]').get_attribute('data-state') == 'sprout'
        decide('[data-action=battery]',disappears='[data-action=battery]')
        assert page.locator('#terminal .terminal-battery-slot [data-lit=true]').count() == 12
        assert page.locator('[data-layer=tool-battery]').is_hidden()
        decide('[data-action=next]',closes=True)
        terminal()
        assert 'Shoots appeared' in page.locator('#summary-copy').inner_text()
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")
        active_key = page.evaluate("(prefix) => Object.keys(localStorage).find(key => key.startsWith(prefix + '.slot.'))", KEY)
        assert active_key
        before = page.evaluate('(key) => localStorage.getItem(key)', active_key)
        page.reload()
        page.locator('[data-menu=continue]').click()
        ready()
        assert before == page.evaluate('(key) => localStorage.getItem(key)', active_key)

        # 注入合法天气状态，验证连续位移、远近速度和减少动画。
        page.evaluate("""(key) => {
          const record = JSON.parse(localStorage.getItem(key));
          const s = record.state;
          Object.assign(s,{sol:4,currentEventId:'sandstorm',weather:'sandstorm',phase:'event',choiceId:null,workId:null});
          localStorage.setItem(key,JSON.stringify(record));
        }""", active_key)
        page.reload()
        page.locator('[data-menu=load]').click()
        page.locator('#save-picker[open]').wait_for()
        assert page.locator('#main-menu').is_visible()
        assert page.locator('#save-list [data-save-id]:enabled').count() == 1
        page.evaluate("""() => {
          window.sceneRevealOpacity = [];
          new MutationObserver(() => {
            const scene = document.querySelector('#scene-viewport');
            if (!scene.hidden) sceneRevealOpacity.push(Number(getComputedStyle(document.querySelector('#morning-veil')).opacity));
          }).observe(document.querySelector('#scene-viewport'),{attributes:true,attributeFilter:['hidden']});
        }""")
        page.locator('#save-list [data-save-id]:enabled').click()
        ready()
        assert page.evaluate('sceneRevealOpacity.length === 1 && sceneRevealOpacity[0] === 1'), 'Saved scene appeared before the black veil'
        terminal()
        page.locator('#reduce-motion').uncheck()
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")
        image = page.locator('[data-layer=exterior-main] img')
        first = image.get_attribute('src')
        assert first.endswith('/main/clear.png')
        assert page.locator('.scene-dust:visible').count() == 4
        # Each window's exterior, dust and cabin frame form a complete stack.
        stack = ['exterior-main','sandstorm-main-far','sandstorm-main-near','outpost-main',
                 'exterior-right','sandstorm-right-far','sandstorm-right-near','outpost-right']
        z_order = page.evaluate('(ids) => ids.map(id => Number(getComputedStyle(document.querySelector(`[data-layer="${id}"]`)).zIndex))', stack)
        assert all(left < right for left, right in zip(z_order, z_order[1:])), z_order
        assert page.locator('[data-layer=outpost]').count() == 0
        assert page.locator('.scene-dust-track img').count() == 8
        tracks = page.locator('.scene-dust-track')
        movement = tracks.first.evaluate('(node) => getComputedStyle(node).transform')
        page.wait_for_function("(before) => getComputedStyle(document.querySelector('.scene-dust-track')).transform !== before", arg=movement)
        timing = tracks.evaluate_all('(nodes) => nodes.map(node => node.getAnimations()[0].effect.getTiming().duration)')
        assert abs(timing[0] / timing[1] - 3) < .001
        assert abs(timing[2] / timing[3] - 3) < .001
        assert image.get_attribute('src') == first
        # A normal render must preserve running animation objects and their phase.
        page.evaluate("window.dustAnimations = [...document.querySelectorAll('.scene-dust-track')].map(node => node.getAnimations()[0])")
        terminal()
        page.locator('#reduce-motion').check()
        page.locator('#reduce-motion').uncheck()
        assert tracks.evaluate_all('(nodes) => nodes.every((node,i) => node.getAnimations()[0] === window.dustAnimations[i])')
        page.locator('#reduce-motion').check()
        page.wait_for_timeout(50)
        frozen = tracks.evaluate_all('(nodes) => nodes.map(node => getComputedStyle(node).transform)')
        page.wait_for_timeout(400)
        assert frozen == tracks.evaluate_all('(nodes) => nodes.map(node => getComputedStyle(node).transform)')
        assert tracks.evaluate_all('(nodes) => nodes.every(node => node.getAnimations()[0].playState === "paused")')
        assert page.locator('.scene-dust-motion').evaluate_all('(nodes) => nodes.every(node => Number(getComputedStyle(node).opacity) === 0.5 && node.getAnimations().every(animation => animation.playState === "paused"))')
        decide('[data-action=choose][data-id=shelter]',appears='#terminal .terminal-note')
        assert page.locator('[data-layer=cabin-lights]').is_hidden()
        assert page.locator('#terminal [data-action=work]').count() == 0
        clipboard()
        assert page.locator('[data-action=work][data-id=research]').is_enabled()
        page.keyboard.press('Escape')
        terminal()
        decide('[data-action=lights][data-id=lights_on]',appears='[data-action=lights][data-id=lights_off]')
        clipboard()
        assert page.locator('[data-action=work][data-id=research]').is_enabled()
        sol_before = page.locator('#tasks-sol').inner_text()
        decide('[data-action=work][data-id=research]')
        assert page.locator('#tasks-sol').inner_text() == sol_before
        assert page.locator('#tasks [data-action=next]').count() == 0
        assert page.locator('#tasks .is-complete').count() == 1
        page.keyboard.press('Escape')
        terminal()
        assert page.locator('[data-action=next]').is_visible()
        decide('[data-action=lights][data-id=lights_off]',appears='[data-action=lights][data-id=lights_on]')
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")

        for width in [390, 768, 1440]:
            page.set_viewport_size({'width': width, 'height': 800})
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            scene_bounds = page.locator('#scene').bounding_box()
            for layer in page.locator('.scene-layer:visible:not(.scene-dust)').all():
                bounds = layer.bounding_box()
                assert all(abs(bounds[key]-scene_bounds[key]) < 1 for key in ['x','y','width','height'])
            for layer in page.locator('.scene-dust:visible').all():
                bounds = layer.bounding_box()
                assert bounds['x'] >= scene_bounds['x'] and bounds['y'] >= scene_bounds['y']
                assert bounds['x']+bounds['width'] <= scene_bounds['x']+scene_bounds['width']+1
                assert bounds['y']+bounds['height'] <= scene_bounds['y']+scene_bounds['height']+1
            clipboard()
            paper = page.locator('#tasks').bounding_box()
            assert paper['x'] >= 0 and paper['x'] + paper['width'] <= width
            assert paper['y'] >= 0 and paper['y'] + paper['height'] <= 800
            page.keyboard.press('Escape')
            terminal()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            bounds = page.locator('#terminal').bounding_box()
            assert bounds['width'] <= width
            assert abs(bounds['width'] - width*.6) < 1
            page.keyboard.press('Escape')
            page.wait_for_function("!document.querySelector('#terminal').open")

        # 新任务另存，旧任务只能在玩家选择后加载；取消读档不修改缓存。
        terminal()
        page.locator('#restart').click()
        page.locator('#main-menu').wait_for(state='visible')
        assert page.locator('.scene-dust:visible').count() == 0
        older = page.evaluate('(key) => localStorage.getItem(key)', active_key)
        page.locator('[data-menu=new]').click()
        page.locator('[value=robot]').check(); page.locator('[value=shield]').check()
        decide('#loadout-form button',closes=True)
        assert page.locator('.scene-dust:visible').count() == 0
        assert page.evaluate('window.dustAnimations.every(animation => animation.playState === "idle")')
        assert page.evaluate('(key) => localStorage.getItem(key)', active_key) == older
        terminal(); page.locator('#restart').click()
        page.locator('#main-menu').wait_for(state='visible')
        page.locator('[data-menu=load]').click()
        assert page.locator('#save-list [data-save-id]:enabled').count() == 2
        before_cancel = page.evaluate('JSON.stringify({...localStorage})')
        page.keyboard.press('Escape')
        assert page.locator('#main-menu').is_visible()
        assert page.evaluate('JSON.stringify({...localStorage})') == before_cancel
        page.locator('[data-menu=load]').click()
        page.locator(f'[data-save-id="{active_key}"]').click()
        ready(); terminal()
        assert page.locator('#terminal-title').inner_text() == 'SOL 04'
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")
        page.reload()
        page.locator('[data-menu=continue]').click()
        ready(); terminal()
        assert page.locator('#terminal-title').inner_text() == 'SOL 01'
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")
        terminal(); page.locator('#restart').click()
        page.locator('#main-menu').wait_for(state='visible')
        page.locator('[data-menu=load]').click()
        before_delete = page.evaluate('JSON.stringify({...localStorage})')
        page.once('dialog', lambda dialog: dialog.dismiss())
        page.locator(f'[data-save-delete="{active_key}"]').click()
        assert page.evaluate('JSON.stringify({...localStorage})') == before_delete
        page.once('dialog', lambda dialog: dialog.accept())
        page.locator(f'[data-save-delete="{active_key}"]').click()
        assert page.locator('#save-list [data-save-id]').count() == 1
        assert page.evaluate('(key) => localStorage.getItem(key)', active_key) is None
        page.once('dialog', lambda dialog: dialog.accept())
        page.locator('#save-list [data-save-delete]').click()
        assert page.locator('#save-list [data-save-id]').count() == 0
        assert page.locator('[data-menu=continue]').is_hidden()
        assert page.locator('#save-picker-message').inner_text().endswith('Start a new game to create one.')
        assert not errors, errors

        # Exercise visibility, stale loads and disposal on an isolated scene.
        lifecycle = page.evaluate("""async () => {
          const {SceneView} = await import('/src/views/SceneView.js');
          const layout = await (await fetch('/data/scene_layout.json')).json();
          const root = document.createElement('div');
          root.style.position = 'relative'; document.body.append(root);
          const scene = new SceneView(root,layout); await scene.mount();
          const storm = {weather:'sandstorm',tools:{}};
          await scene.render(storm,false);
          const dust = scene.layers.filter(layer => layer.track);
          const animations = dust.flatMap(layer => [layer.animation,layer.variation]);
          const breaths = dust.map(layer => layer.variation);
          const initialOpacity = breaths.every(animation => Number(animation.effect.getKeyframes()[0].opacity) === 0.5);
          const independent = new Set(breaths.map(animation => animation.effect.getTiming().duration)).size === 4;
          // Seek to a breath peak, then finish it to verify a new cycle is generated.
          const breath = breaths[0]; const frames = breath.effect.getKeyframes();
          breath.currentTime = breath.effect.getTiming().duration * frames[2].offset;
          const style = getComputedStyle(dust[0].drift);
          const breathing = Number(style.opacity) > 0.5 && Number(style.opacity) <= 0.7;
          const matrix = new DOMMatrix(style.transform);
          const scaling = matrix.a >= 1.04 && matrix.a <= 1.16;
          await new Promise(resolve => { breath.addEventListener('finish',resolve,{once:true}); breath.finish(); });
          const renewed = dust[0].variation !== breath && dust[0].variation.playState === 'running';
          animations[1] = dust[0].variation;
          animations.forEach(animation => { animation.currentTime = 1000; });
          await scene.render(storm,false);
          const retained = dust.every((layer,i) => layer.animation === animations[i*2] && layer.variation === animations[i*2+1] && layer.animation.currentTime >= 1000);
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
          const paused = animations.every(animation => animation.playState === 'paused');
          delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
          const resumed = animations.every(animation => animation.playState === 'running');
          await Promise.all([scene.render(null,false),scene.render(storm,false),scene.render(null,false)]);
          const clear = scene.layers.filter(layer => layer.config.viewport).every(layer => layer.node.hidden && !layer.animation && !layer.variation);
          await scene.render(storm,false);
          const finalAnimations = scene.layers.filter(layer => layer.animation).flatMap(layer => [layer.animation,layer.variation]);
          scene.dispose(); root.remove();
          return {initialOpacity,independent,breathing,scaling,renewed,retained,paused,resumed,clear,disposed:finalAnimations.length === 8 && finalAnimations.every(animation => animation.playState === 'idle')};
        }""")
        assert all(lifecycle.values()), lifecycle

        # 素材全部缺失时不会自动拼图，终端仍可使用。
        missing = browser.new_context(reduced_motion='reduce')
        missing.route('**/assets/scene/**/*.png', lambda route: route.fulfill(status=404, body=''))
        missing_page = missing.new_page()
        missing_page.goto(url)
        missing_page.locator('[data-menu=settings]').click()
        missing_page.locator('#language-select').select_option('zh-CN')
        assert missing_page.locator('#terminal-title').inner_text() == '设置'
        missing_page.keyboard.press('Escape')
        missing_page.wait_for_function("!document.querySelector('#terminal').open")
        assert missing_page.locator('[data-menu=new]').inner_text() == '新游戏'
        missing_page.locator('[data-menu=load]').click()
        assert missing_page.locator('#save-picker-message').inner_text() == '还没有本地存档，开始新游戏后会自动创建。'
        missing_page.keyboard.press('Escape')
        assert missing_page.locator('#main-menu').is_visible()
        missing_page.reload()
        missing_page.locator('[data-menu=new]').wait_for()
        assert missing_page.locator('[data-menu=new]').inner_text() == '新游戏'
        assert missing_page.locator('#scene img').count() == 0
        assert missing_page.evaluate("""async () => {
          const {SceneView} = await import('/src/views/SceneView.js');
          const layout = await (await fetch('/data/scene_layout.json')).json();
          const root = document.createElement('div'); document.body.append(root);
          const scene = new SceneView(root,layout); await scene.mount();
          await scene.render({weather:'sandstorm',tools:{}},false);
          const hidden = scene.layers.filter(layer => layer.config.viewport).every(layer => layer.node.hidden && !layer.animation);
          scene.dispose(); root.remove(); return hidden;
        }""")
        missing_page.locator('[data-menu=new]').click()
        missing_page.locator('#loadout-form').wait_for()
        # Real transition timing and volume envelope, using silent WAV test data in memory.
        sample = io.BytesIO()
        with wave.open(sample, 'wb') as sound:
            sound.setnchannels(1); sound.setsampwidth(2); sound.setframerate(8000)
            sound.writeframes(b'\0' * 8000 * 2 * 12)
        cinema = browser.new_context(reduced_motion='no-preference')
        cinema.route('**/ambient.mp3', lambda route: route.fulfill(content_type='audio/wav', body=sample.getvalue()))
        cinema.add_init_script("""const originalPlay = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function() { window.testAudio = this; return originalPlay.call(this); };""")
        movie = cinema.new_page(); movie.goto(url)
        movie.locator('[data-menu=new]').wait_for()
        movie.locator('[data-menu=new]').click(force=True)  # Floating button intentionally moves.
        movie.locator('[value=toolkit]').check(); movie.locator('[value=battery]').check()
        movie.evaluate("""() => {
          window.transitionSamples = [];
          const sample = () => {
            transitionSamples.push({
              veil: Number(getComputedStyle(document.querySelector('#morning-veil')).opacity),
              title: Number(getComputedStyle(document.querySelector('#sol-title')).opacity)
            });
            window.transitionSampler = requestAnimationFrame(sample);
          };
          sample();
        }""")
        movie.locator('#loadout-form button').click()
        movie.wait_for_function("document.querySelector('#sol-title').textContent === 'SOL 001'")
        movie.wait_for_function('window.testAudio && testAudio.volume > 0.2')
        movie.locator('#terminal-toggle:enabled').wait_for()
        assert movie.evaluate('testAudio.paused && testAudio.volume === 0')
        assert movie.locator('#morning-veil').evaluate('(node) => getComputedStyle(node).opacity') == '0'
        samples = movie.evaluate('cancelAnimationFrame(transitionSampler); transitionSamples')
        assert any(0 < item['veil'] < 1 for item in samples), 'Scene fade was not observed'
        assert any(0 < item['title'] < 1 and item['veil'] == 1 for item in samples), 'Title fade on full black was not observed'
        assert all(item['title'] == 0 for item in samples if item['veil'] < 1), 'Title appeared during a scene fade'
        browser.close()
        print('Browser smoke passed: terminal, summaries, PNG states, dust parallax, reduced motion, missing assets, 3 viewport sizes.')
finally:
    server.shutdown()
    server.server_close()
