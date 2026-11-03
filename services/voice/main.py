# Extracted from a larger private codebase (CALLIOPE). Source: services/voice/main.py; adapted: standard-library HTTP transport and injectable provider ports replace WebSocket/model dependencies.
"""Loopback-only voice demonstration. Fake providers never claim real inference."""
import argparse
import base64
import binascii
import json
import re
import struct
import wave
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Protocol

MAX_AUDIO_BYTES = 2 * 1024 * 1024
MAX_TEXT_CHARS = 4000
MAX_REQUEST_BYTES = 3 * 1024 * 1024
BOUNDED_FAILURE_MESSAGE_CHARS = 200
PATH_LEAK = re.compile(r'(?:/[\w. -]+){2,}')


def bound_failure_message(message):
    text = str(message or 'Voice analysis is unavailable.')
    text = PATH_LEAK.sub('[path]', text)
    return text.replace('Traceback', '')[:BOUNDED_FAILURE_MESSAGE_CHARS]


class SttProvider(Protocol):
    name: str
    def transcribe(self, audio: bytes) -> str: ...


class TtsProvider(Protocol):
    name: str
    def synthesize(self, text: str) -> bytes: ...


class FakeStt:
    name = 'fake-stt'
    def transcribe(self, audio: bytes) -> str:
        # Deterministic output, deliberately not a speech recognition claim.
        return '[synthetic transcript]'


class FakeTts:
    name = 'fake-tts'
    def synthesize(self, text: str) -> bytes:
        # Produce a valid silent WAV in memory; no prerecorded audio is used.
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16000)
            output.writeframes(struct.pack('<h', 0) * min(16000, len(text) * 160))
        return buffer.getvalue()


class VoiceError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.status = code, status


def validate_audio_format(audio, content_type):
    """Accept bounded PCM WAV uploads; reject mislabeled or malformed input."""
    if content_type not in ('audio/wav', 'audio/x-wav'):
        raise VoiceError('UNSUPPORTED_FORMAT', 'Only WAV audio is supported.', 415)
    try:
        with wave.open(io.BytesIO(audio), 'rb') as source:
            if source.getcomptype() != 'NONE' or source.getnchannels() not in (1, 2):
                raise ValueError('unsupported WAV encoding')
            if source.getsampwidth() not in (1, 2, 3, 4) or source.getframerate() <= 0:
                raise ValueError('invalid WAV parameters')
            if source.getnframes() <= 0:
                raise ValueError('empty WAV')
            expected = source.getnframes() * source.getnchannels() * source.getsampwidth()
            if len(source.readframes(source.getnframes())) != expected:
                raise ValueError('truncated WAV')
    except (wave.Error, EOFError, ValueError):
        raise VoiceError('BAD_AUDIO', 'Audio must be a valid non-empty PCM WAV file.', 422) from None


class VoiceService:
    def __init__(self, stt=None, tts=None):
        self.stt = stt or FakeStt()
        self.tts = tts or FakeTts()
        self.transcription_verified = False

    def health(self):
        return {'status': 'ok', 'stt': self.stt.name, 'tts': self.tts.name,
                'synthetic': isinstance(self.stt, FakeStt) or isinstance(self.tts, FakeTts),
                'transcriptionVerified': self.transcription_verified}

    def transcribe(self, payload):
        encoded = payload.get('audio')
        if not isinstance(encoded, str) or not encoded:
            raise VoiceError('BAD_AUDIO', 'Audio must be a non-empty base64 string.')
        if len(encoded) > ((MAX_AUDIO_BYTES + 2) // 3) * 4:
            raise VoiceError('AUDIO_TOO_LARGE', 'Audio exceeds the size limit.', 413)
        try:
            audio = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise VoiceError('BAD_AUDIO', 'Audio packet could not be decoded.') from None
        if not audio:
            raise VoiceError('BAD_AUDIO', 'Audio packet is empty.')
        if len(audio) > MAX_AUDIO_BYTES:
            raise VoiceError('AUDIO_TOO_LARGE', 'Audio exceeds the size limit.', 413)
        validate_audio_format(audio, payload.get('contentType', 'audio/wav'))
        try:
            text = self.stt.transcribe(audio)
        except Exception:
            raise VoiceError('TRANSCRIPTION_FAILED', 'Speech transcription failed. Use typed fallback.', 503) from None
        if not isinstance(text, str) or not text.strip():
            raise VoiceError('BAD_AUDIO', 'No speech could be transcribed. Use typed fallback.', 422)
        if not isinstance(self.stt, FakeStt):
            self.transcription_verified = True
        return {'text': text, 'isFinal': True, 'inputMode': 'audio',
                'synthetic': isinstance(self.stt, FakeStt)}

    def synthesize(self, payload):
        text = payload.get('text')
        if not isinstance(text, str) or not text.strip():
            raise VoiceError('BAD_TEXT', 'Text must be a non-empty string.')
        if len(text) > MAX_TEXT_CHARS:
            raise VoiceError('TEXT_TOO_LARGE', 'Text exceeds the size limit.', 413)
        try:
            audio = self.tts.synthesize(text)
            if not isinstance(audio, bytes) or not audio:
                raise ValueError('empty provider response')
        except Exception:
            raise VoiceError('SYNTHESIS_FAILED', 'Speech synthesis is unavailable.', 503) from None
        return {'audio': base64.b64encode(audio).decode('ascii'),
                'contentType': 'audio/wav', 'synthetic': isinstance(self.tts, FakeTts)}


def make_handler(service):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Do not log user input or request bodies.
            return

        def respond(self, status, payload):
            body = json.dumps(payload).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == '/health':
                self.respond(200, service.health())
            else:
                self.respond(404, {'code': 'NOT_FOUND', 'message': 'Unknown endpoint.'})

        def do_POST(self):
            try:
                if self.path not in ('/transcribe', '/synthesize'):
                    raise VoiceError('NOT_FOUND', 'Unknown endpoint.', 404)
                raw_length = self.headers.get('Content-Length')
                if raw_length is None or not raw_length.isdecimal():
                    raise VoiceError('BAD_REQUEST', 'A valid content length is required.')
                length = int(raw_length)
                if length > MAX_REQUEST_BYTES:
                    raise VoiceError('REQUEST_TOO_LARGE', 'Request exceeds the size limit.', 413)
                self.connection.settimeout(10)
                try:
                    payload = json.loads(self.rfile.read(length))
                except (ValueError, UnicodeError, TimeoutError):
                    raise VoiceError('BAD_REQUEST', 'Invalid or incomplete JSON request.') from None
                if not isinstance(payload, dict):
                    raise VoiceError('BAD_REQUEST', 'Expected a JSON object.')
                result = service.transcribe(payload) if self.path == '/transcribe' else service.synthesize(payload)
                self.respond(200, result)
            except VoiceError as error:
                self.respond(error.status, {'code': error.code, 'message': bound_failure_message(error)})
    return Handler


def main():
    parser = argparse.ArgumentParser(description='Local voice demonstration')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(VoiceService()))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
