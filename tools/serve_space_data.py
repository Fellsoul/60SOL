"""Serve the game and automatically fetch the current JPL Earth–Mars light time.
Run: python3 tools/serve_space_data.py
Optional: --current-file /path/to/approved-raw-pack.json overrides automatic input.
No credentials or arbitrary remote URLs are accepted from the browser.
"""
import argparse
import json
import time
import threading
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 131072


class CurrentData:
    """Cache a successful current calculation for one hour; back off outages for 30 seconds."""
    def __init__(self, fetcher=None, clock=time.monotonic):
        self.fetcher = fetcher or self.fetch
        self.clock = clock
        self.lock = threading.Lock()
        self.body = None
        self.refresh_at = 0
        self.retry_at = 0

    @staticmethod
    def fetch():
        today = datetime.now(timezone.utc).date()
        params = {'format': 'json', 'COMMAND': "'499'", 'CENTER': "'500@399'",
                  'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'", 'OBJ_DATA': "'YES'",
                  'START_TIME': f"'{today}'", 'STOP_TIME': f"'{today + timedelta(days=1)}'",
                  'STEP_SIZE': "'1 d'", 'QUANTITIES': "'21'", 'CSV_FORMAT': "'YES'"}
        request = Request('https://ssd.jpl.nasa.gov/api/horizons.api?' + urlencode(params),
                          headers={'Accept': 'application/json', 'User-Agent': '60SOL/1.0'})
        if shutil.which('curl'):
            # System curl uses the OS certificate store on macOS; never disable TLS checks.
            result = subprocess.run(['curl', '--fail', '--silent', '--show-error',
                                     '--proto', '=https', '--max-time', '6',
                                     '--max-filesize', str(LIMIT), '--header', 'Accept: application/json',
                                     '--user-agent', '60SOL/1.0', request.full_url],
                                    capture_output=True, timeout=7)
            if result.returncode:
                raise ValueError('Horizons request failed')
            body = result.stdout
        else:
            with urlopen(request, timeout=6) as response:
                if response.headers.get_content_type() != 'application/json':
                    raise ValueError('Unexpected upstream content type')
                body = response.read(LIMIT + 1)
        if len(body) > LIMIT:
            raise ValueError('Oversize upstream input')
        horizons = json.loads(body)
        if not isinstance(horizons, dict) or not isinstance(horizons.get('result'), str) or horizons.get('error'):
            raise ValueError('Invalid Horizons result')
        # No current environmental measurement or Mars advisory is fabricated.
        return json.dumps({'schemaVersion': 2, 'horizons': horizons}).encode('utf-8')

    def get(self):
        with self.lock:
            now = self.clock()
            if self.body is not None and now < self.refresh_at:
                return self.body
            if now < self.retry_at:
                raise ValueError('Upstream retry pending')
            try:
                body = self.fetcher()
                if len(body) > LIMIT:
                    raise ValueError('Oversize input')
            except (OSError, ValueError, URLError, subprocess.SubprocessError):
                self.retry_at = now + 30
                raise
            self.body = body
            self.refresh_at = now + 3600
            return body


class Handler(SimpleHTTPRequestHandler):
    current_file = None
    current_data = CurrentData()

    def do_GET(self):
        if self.path != '/api/space-data':
            return super().do_GET()
        try:
            if self.current_file:
                path = Path(self.current_file)
                if path.stat().st_size > LIMIT:
                    raise ValueError('Oversize input')
                with path.open('rb') as stream:
                    body = stream.read(LIMIT + 1)
                if len(body) > LIMIT:
                    raise ValueError('Oversize input')
                data = json.loads(body)
                if not isinstance(data, dict) or (data.get('schemaVersion') != 2 and set(data) != {'donki', 'horizons', 'rems'}):
                    raise ValueError('Unexpected pack schema')
            else:
                body = self.current_data.get()
        except (ValueError, OSError, subprocess.SubprocessError):
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Retry-After', '60')
            self.end_headers()
            self.wfile.write(b'{"status":"UNAVAILABLE"}')
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--current-file')
    args = parser.parse_args()
    Handler.current_file = args.current_file
    ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT))).serve_forever()
