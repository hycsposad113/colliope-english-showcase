# Extracted from a larger private codebase (CALLIOPE). Source: services/voice/main.py:45-66,229-320,378-466,570-610; adapted: offline provider and HTTP tests.
import base64
import importlib.util
import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('voice', Path(__file__).resolve().parents[1] / 'services/voice/main.py')
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)

def sample_audio():
    return base64.b64encode(voice.FakeTts().synthesize('hello')).decode()

class VoiceTests(unittest.TestCase):
    def test_fake_providers_are_explicit(self):
        service = voice.VoiceService()
        self.assertTrue(service.health()['synthetic'])
        self.assertFalse(service.health()['transcriptionVerified'])
        self.assertEqual(service.transcribe({'audio': sample_audio()})['text'], '[synthetic transcript]')
        self.assertTrue(base64.b64decode(service.synthesize({'text': 'hello'})['audio']).startswith(b'RIFF'))

    def test_bad_and_oversized_audio(self):
        service = voice.VoiceService()
        for data, code in [('!!!', 'BAD_AUDIO'), ('A' * (voice.MAX_REQUEST_BYTES + 1), 'AUDIO_TOO_LARGE')]:
            with self.assertRaises(voice.VoiceError) as error:
                service.transcribe({'audio': data})
            self.assertEqual(error.exception.code, code)

    def test_provider_failure_is_bounded(self):
        class Broken:
            name = 'broken'
            def transcribe(self, audio):
                raise RuntimeError('private details')
        with self.assertRaises(voice.VoiceError) as error:
            voice.VoiceService(stt=Broken()).transcribe({'audio': sample_audio()})
        self.assertNotIn('private details', str(error.exception))
        self.assertEqual(error.exception.status, 503)

    def test_rejects_wrong_format_and_malformed_wav(self):
        service = voice.VoiceService()
        for payload, code in [({'audio': sample_audio(), 'contentType': 'audio/mp3'}, 'UNSUPPORTED_FORMAT'),
                              ({'audio': base64.b64encode(b'broken').decode()}, 'BAD_AUDIO')]:
            with self.assertRaises(voice.VoiceError) as error:
                service.transcribe(payload)
            self.assertEqual(error.exception.code, code)

    def test_http_health_and_invalid_json(self):
        import io
        from unittest.mock import Mock
        handler_type = voice.make_handler(voice.VoiceService())
        handler = handler_type.__new__(handler_type)
        handler.respond = Mock()
        handler.path = '/health'
        handler.do_GET()
        self.assertTrue(handler.respond.call_args.args[1]['synthetic'])
        handler.path = '/transcribe'
        handler.headers = {'Content-Length': '1'}
        handler.rfile = io.BytesIO(b'{')
        handler.connection = Mock()
        handler.do_POST()
        self.assertEqual(handler.respond.call_args.args[0], 400)
        self.assertEqual(handler.respond.call_args.args[1]['code'], 'BAD_REQUEST')

if __name__ == '__main__':
    unittest.main()
