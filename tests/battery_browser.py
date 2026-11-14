"""Verify the supplied battery artwork and grayscale lamp overlays in Edge."""
import io
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width':1440,'height':900},reduced_motion='reduce')
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.locator('[data-menu=new]').click()
        page.locator('[value=toolkit]').check(); page.locator('[value=battery]').check()
        page.locator('#loadout-form button').click()
        page.locator('#terminal-toggle:enabled').click()
        page.locator('#terminal.is-console[open]').wait_for()
        page.wait_for_load_state('networkidle')
        slot = page.locator('#terminal .terminal-battery-slot')
        for energy in [0,1,4,7,9,11,12]:
            page.evaluate('''async energy => {
              const {BatterySlotView} = await import('/src/views/BatterySlotView.js');
              BatterySlotView.prototype.render.call({slots:[...document.querySelectorAll('.terminal-battery-slot')]},{energy});
            }''', energy)
            shot = Image.open(io.BytesIO(slot.screenshot())).convert('RGB')
            for row,y in enumerate([321,548,771]):
                for col,x in enumerate([725,842,959,1075]):
                    r,g,b = shot.getpixel((round(x*shot.width/1536),round(y*shot.height/1024)))
                    lit = row*4+3-col >= 12-energy
                    assert (g > b+30) if lit else (max(r,g,b)-min(r,g,b) < 12), (energy,row,col,(r,g,b))
        page.screenshot(path=str(Path(tempfile.gettempdir())/'nasa-battery-terminal.png'))
        for width in [390,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            bounds=slot.bounding_box()
            assert bounds['x'] >= 0 and bounds['x']+bounds['width'] <= width+1
        browser.close()
        print('Battery visual checks passed: gray/green lamps at seven charge levels and three viewport sizes.')
finally:
    server.shutdown(); server.server_close()
