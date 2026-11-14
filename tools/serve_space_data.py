"""Local static server with a bounded, same-origin approved-data endpoint.
Run: python3 tools/serve_space_data.py --current-file /path/to/approved-raw-pack.json
Without an approved current file the endpoint returns 503; clients use cache/replay.
No credentials or arbitrary remote URLs are accepted from the browser.
"""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 131072


class Handler(SimpleHTTPRequestHandler):
    current_file = None

    def do_GET(self):
        if self.path != '/api/space-data':
            return super().do_GET()
        try:
            if not self.current_file:
                raise ValueError('No approved current input')
            path = Path(self.current_file)
            if path.stat().st_size > LIMIT:
                raise ValueError('Oversize input')
            with path.open('rb') as stream:
                body = stream.read(LIMIT + 1)
            if len(body) > LIMIT:
                raise ValueError('Oversize input')
            data = json.loads(body)
            if not isinstance(data, dict) or set(data) != {'donki', 'horizons', 'rems'}:
                raise ValueError('Unexpected pack schema')
        except (ValueError, OSError):
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
