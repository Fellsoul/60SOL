"""Run with: python3 -m unittest discover -s tests -p '*_test.py'."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('space_server', Path(__file__).resolve().parents[1] / 'tools/serve_space_data.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class CurrentDataTests(unittest.TestCase):
    def test_success_is_cached_and_refreshed_after_one_hour(self):
        now = [0]
        calls = []
        def fetch():
            calls.append(1)
            return str(len(calls)).encode()
        data = server.CurrentData(fetcher=fetch, clock=lambda: now[0])
        self.assertEqual(data.get(), b'1')
        self.assertEqual(data.get(), b'1')
        now[0] = 3601
        self.assertEqual(data.get(), b'2')

    def test_failed_refresh_does_not_silently_serve_expired_data_and_backs_off(self):
        now = [0]
        calls = []
        def fetch():
            calls.append(1)
            if len(calls) > 1:
                raise OSError('offline')
            return b'current'
        data = server.CurrentData(fetcher=fetch, clock=lambda: now[0])
        self.assertEqual(data.get(), b'current')
        now[0] = 3601
        with self.assertRaises(OSError):
            data.get()
        with self.assertRaises(ValueError):
            data.get()
        self.assertEqual(len(calls), 2)
