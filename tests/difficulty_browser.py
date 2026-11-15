"""Difficulty picker, actual new-game saves, reloads and narrow-screen layout."""
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
pixel = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
saved_state = "Object.keys(localStorage).filter(k=>k.includes('.slot.')).map(k=>JSON.parse(localStorage[k]).state)[0]"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for difficulty, generation, energy in [('easy',9,10),('medium',8,9),('hard',6,9)]:
            context = browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
            context.route('**/*.png', lambda route: route.fulfill(content_type='image/png',body=pixel))
            context.route('**/api/space-data', lambda route: route.fulfill(status=503,body='Offline test'))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}')
            page.locator('[data-menu=new]').click()
            assert page.locator('#difficulty-picker').evaluate('(el)=>el.open')
            assert page.locator('[data-difficulty]').evaluate_all('(els)=>els.map(el=>el.dataset.difficulty)') == ['easy','medium','hard']
            box = page.locator('#difficulty-picker').bounding_box()
            assert abs(box['x']+box['width']/2-640) < 2
            assert abs(box['y']+box['height']/2-450) < 2
            assert page.locator('#scene-viewport').is_hidden()
            page.keyboard.press('Escape')
            assert not page.locator('#difficulty-picker').evaluate('(el)=>el.open')
            assert page.evaluate('Object.keys(localStorage).filter(k=>k.includes(".slot.")).length') == 0
            page.locator('[data-menu=new]').click()
            page.locator(f'[data-difficulty={difficulty}]').click()
            page.locator('[name=tool][value=toolkit]').check()
            page.locator('[name=tool][value=battery]').check()
            page.evaluate('''() => {
              window.firstSceneOpacity=null;
              const observer=new MutationObserver(()=>{
                if(!document.querySelector('#scene-viewport').hidden && window.firstSceneOpacity===null)
                  window.firstSceneOpacity=document.querySelector('#morning-veil').style.opacity;
              });
              observer.observe(document.querySelector('#scene-viewport'),{attributes:true});
            }''')
            page.locator('#loadout-form button[type=submit]').click()
            page.locator('#tasks-toggle:enabled').wait_for(timeout=20000)
            state = page.evaluate(saved_state)
            assert (state['difficulty'],state['generation'],state['energy']) == (difficulty,generation,energy)
            assert page.evaluate('window.firstSceneOpacity') == '1'
            page.reload()
            page.locator('[data-menu=continue]').click()
            page.locator('#tasks-toggle:enabled').wait_for(timeout=20000)
            assert page.evaluate(saved_state) == state
            assert not errors, errors
            context.close()
        context = browser.new_context(viewport={'width':375,'height':667}, reduced_motion='reduce')
        context.route('**/*.png', lambda route: route.fulfill(content_type='image/png',body=pixel))
        context.route('**/api/space-data', lambda route: route.fulfill(status=503,body='Offline test'))
        page = context.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.locator('[data-menu=new]').click()
        box = page.locator('#difficulty-picker').bounding_box()
        assert box['x'] >= 0 and box['x']+box['width'] <= 375
        assert box['y'] >= 0 and box['y']+box['height'] <= 667
        assert page.locator('[data-difficulty=hard]').is_visible()
        browser.close()
        print('Difficulty browser passed: centered picker, cancellation, all three saves/reloads, black entry, mobile layout.')
finally:
    server.shutdown()
