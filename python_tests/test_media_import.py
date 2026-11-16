import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import media_import as media

class ImportTests(unittest.TestCase):
    def test_url_validation(self):
        self.assertEqual(media.canonical('https://www.bilibili.com/video/BV1abc?p=2&ignored=1'), 'https://www.bilibili.com/video/BV1abc?p=2')
        for value in ['http://bilibili.com/video/BV1abc', 'https://bilibili.com.evil.test/video/BV1abc', 'https://user@bilibili.com/video/BV1abc', 'https://bilibili.com/video/BV1abc?p=0']:
            with self.assertRaises(ValueError): media.canonical(value)
    def test_ranges(self):
        self.assertEqual(media.byte_range('bytes=2-5', 10), (2, 5, 206))
        self.assertEqual(media.byte_range('bytes=-2', 10), (8, 9, 206))
        with self.assertRaises(ValueError): media.byte_range('bytes=10-', 10)
    def test_reuses_ready_media(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(media, 'ROOT', Path(tmp)):
            ident = 'a' * 32; path = media.folder(ident); path.mkdir(); (path / 'media.mp4').write_bytes(b'fixture')
            url = media.canonical('https://bilibili.com/video/BV1abc')
            media.save(path, {'id': ident, 'status': 'ready', 'created': time.time(), 'sourceHash': media.hashlib.sha256(url.encode()).hexdigest()})
            self.assertEqual(media.start(url)['id'], ident)
    def test_ticket_is_scoped(self):
        self.assertNotEqual(media.ticket('a', 12, 'secret'), media.ticket('b', 12, 'secret'))
