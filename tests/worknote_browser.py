"""Real-browser regressions for worknote ordering, event routing and opt-in trips."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(Path(__file__).resolve().parents[1])))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(reduced_motion='reduce')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.locator('[data-menu=new]').wait_for()

        def load_case(case):
            page.evaluate("""async (scenario) => {
              localStorage.clear();
              const {loadContent} = await import('/src/services/ContentLoader.js');
              const {GameModel} = await import('/src/models/GameModel.js');
              const {SaveRepository} = await import('/src/repositories/SaveRepository.js');
              const c = await loadContent(); c.events = c.events.filter(e => !e.dailySol);
              const m = new GameModel(c); m.start(['toolkit','battery']);
              if (scenario !== 'pending') m.choose('plan');
              const state = m.snapshot;
              if (scenario === 'empty') state.energy = 0;
              if (scenario === 'emergency') { state.energy = 1; state.dusty = true; }
              new SaveRepository(localStorage,c).save(state);
            }""", case)
            page.reload()
            page.locator('[data-menu=continue]').click()
            page.locator('#tasks-toggle:enabled').wait_for(timeout=20000)

        def tasks():
            if page.locator('#terminal[open]').count():
                page.keyboard.press('Escape')
                page.wait_for_function('!document.querySelector("#terminal").open')
            page.locator('#tasks-toggle:enabled').click()
            page.locator('#tasks[open]').wait_for()

        def terminal():
            if page.locator('#tasks[open]').count():
                page.keyboard.press('Escape')
            page.locator('#terminal-toggle:enabled').click()
            page.locator('#terminal[open]').wait_for()
            assert page.locator('#terminal [data-action=choose], #terminal [data-action=emergency_clean]').count() == 0

        load_case('pending')
        terminal()
        tasks()
        assert page.locator('.sampling-board').count() == 0
        page.locator('#tasks [data-action=choose][data-id=plan]').click()
        page.locator('#tasks [data-action=work][data-id=grow]:enabled').wait_for()
        assert page.locator('.sampling-board').count() == 0
        page.locator('#tasks [data-action=work][data-id=grow]').click()
        page.locator('.sampling-board').wait_for()
        assert page.locator('#tasks-content > :last-child').get_attribute('class') == 'sampling-board'
        assert not page.locator('#expedition-check').is_checked()
        page.locator('#expedition-check').check()
        page.locator('[data-action=expedition][data-id=astronaut-a]').click()
        page.locator('[data-action=expedition][aria-pressed=true]').wait_for()
        page.locator('#expedition-check').uncheck()
        page.wait_for_function("!document.querySelector('#expedition-check').checked && document.querySelector('[data-crew-picker]').hidden")
        terminal()
        page.locator('#terminal [data-action=next]:enabled').click()
        page.locator('#tasks-toggle:enabled').wait_for(timeout=20000)
        assert page.evaluate("Object.keys(localStorage).filter(k=>k.includes('.slot.')).every(k=>Object.values(JSON.parse(localStorage[k]).state.crew).every(c=>c.departSol===null))")

        load_case('empty')
        tasks()
        page.locator('.sampling-board').wait_for()
        assert not page.locator('#expedition-check').is_checked()
        terminal()
        assert page.locator('#terminal [data-action=next]').is_enabled()
        page.locator('#terminal [data-action=next]').click()
        page.locator('#tasks-toggle:enabled').wait_for(timeout=20000)

        load_case('emergency')
        terminal()
        tasks()
        assert page.locator('#tasks [data-action=emergency_clean]').count() > 0
        assert not errors, errors
        browser.close()
        print('Worknote browser passed: event-only routing, sampling last and gated, uncheck cancels, no-resource day can end, emergency options on worknote.')
finally:
    server.shutdown()
