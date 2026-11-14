"""终端和素材读取冒烟测试。需要 Playwright + 本机 Edge。

PNG 响应使用内存中的单像素测试样本，不向素材文件夹写入图片。
实际美术构图与序列流畅度需要用户提供素材后另行验收。
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
        context.route('**/assets/scene/**/*.png', lambda route: route.continue_() if route.request.url.endswith('/outpost_console.png') else route.fulfill(status=200, content_type='image/png', body=PIXEL))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def ready():
            page.locator('#terminal-toggle:enabled').wait_for()

        def terminal():
            ready()
            page.locator('#terminal-toggle').click()
            page.locator('#terminal[open]').wait_for()

        def decide(selector):
            page.locator(selector).click()
            page.wait_for_function("!document.querySelector('#terminal').open")
            ready()

        page.goto(url)
        page.locator('[data-menu=new]').click()
        assert page.locator('progress, #resources, #journal').count() == 0
        page.locator('[value=toolkit]').check()
        page.locator('[value=battery]').check()
        assert page.locator('[value=robot]').is_disabled()
        decide('#loadout-form button')
        collapsed = page.locator('#terminal-toggle').bounding_box()
        assert abs(collapsed['width'] - 1440 * .6) < 1
        assert abs((900-collapsed['y'])/collapsed['height'] - .1) < .01
        terminal()
        expanded = page.locator('#terminal').bounding_box()
        assert abs((900-expanded['y'])/expanded['height'] - .8) < .01
        screen = page.locator('.is-console .terminal-shell').bounding_box()
        assert screen['y'] >= expanded['y'] and screen['y']+screen['height'] <= 900
        page.mouse.click(10, 10)
        page.wait_for_function("!document.querySelector('#terminal').open")
        terminal()
        assert page.locator('#terminal-title').inner_text() == 'SOL 01'
        decide('[data-action=choose][data-id=grow]')
        assert page.locator('[data-layer=plants]').get_attribute('data-state') == 'sprout'
        terminal()
        decide('[data-action=battery]')
        assert page.locator('[data-layer=tool-battery]').is_hidden()
        terminal()
        decide('[data-action=next]')
        terminal()
        assert 'Shoots appeared' in page.locator('#summary-copy').inner_text()
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")
        before = page.evaluate('(key) => localStorage.getItem(key)', KEY)
        page.reload()
        page.locator('[data-menu=continue]').click()
        ready()
        assert before == page.evaluate('(key) => localStorage.getItem(key)', KEY)

        # 注入合法天气状态，验证路径、往返帧播放和减少动画。
        page.evaluate("""(key) => {
          const s = JSON.parse(localStorage.getItem(key));
          Object.assign(s,{sol:4,currentEventId:'sandstorm',weather:'sandstorm',phase:'event',choiceId:null,workId:null});
          localStorage.setItem(key,JSON.stringify(s));
        }""", KEY)
        page.reload()
        page.locator('[data-menu=load]').click()
        ready()
        terminal()
        page.locator('#reduce-motion').uncheck()
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('#terminal').open")
        image = page.locator('[data-layer=exterior-main] img')
        first = image.get_attribute('src')
        page.wait_for_function("(src) => document.querySelector('[data-layer=exterior-main] img').src !== src", arg=first)
        terminal()
        page.locator('#reduce-motion').check()
        page.wait_for_timeout(50)
        first = image.get_attribute('src')
        page.wait_for_timeout(400)
        assert image.get_attribute('src') == first
        decide('[data-action=choose][data-id=shelter]')
        assert page.locator('[data-layer=cabin-lights]').is_hidden()

        for width in [390, 768, 1440]:
            page.set_viewport_size({'width': width, 'height': 800})
            scene_bounds = page.locator('#scene').bounding_box()
            for layer in page.locator('.scene-layer:visible').all():
                bounds = layer.bounding_box()
                assert all(abs(bounds[key]-scene_bounds[key]) < 1 for key in ['x','y','width','height'])
            terminal()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            bounds = page.locator('#terminal').bounding_box()
            assert bounds['width'] <= width
            assert abs(bounds['width'] - width*.6) < 1
            page.keyboard.press('Escape')
            page.wait_for_function("!document.querySelector('#terminal').open")
        assert not errors, errors

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
        missing_page.reload()
        missing_page.locator('[data-menu=new]').wait_for()
        assert missing_page.locator('[data-menu=new]').inner_text() == '新游戏'
        assert missing_page.locator('#scene img').count() == 0
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
        print('Browser smoke passed: terminal, summaries, PNG states, sequence timing, reduced motion, missing assets, 3 viewport sizes.')
finally:
    server.shutdown()
    server.server_close()
