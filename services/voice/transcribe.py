# Extracted from a larger private codebase (CALLIOPE). Source: services/voice/transcribe.py:1-35; adapted: bounded local input and injectable demonstration provider without model dependencies.
"""Run the synthetic transcription provider on a local input file."""
import argparse
import sys
from pathlib import Path
from main import FakeStt, MAX_AUDIO_BYTES, VoiceError


def transcribe_file(path, provider=None):
    source = Path(path)
    if not source.is_file():
        raise VoiceError('BAD_AUDIO', 'Input file does not exist.')
    with source.open('rb') as handle:
        audio = handle.read(MAX_AUDIO_BYTES + 1)
    if not audio:
        raise VoiceError('BAD_AUDIO', 'Audio packet is empty.')
    if len(audio) > MAX_AUDIO_BYTES:
        raise VoiceError('AUDIO_TOO_LARGE', 'Audio exceeds the size limit.')
    text = (provider or FakeStt()).transcribe(audio)
    if not isinstance(text, str) or not text.strip():
        raise VoiceError('BAD_AUDIO', 'No speech could be transcribed.')
    return text


def main():
    parser = argparse.ArgumentParser(description='Synthetic local transcription demonstration')
    parser.add_argument('--input', required=True, help='Path to an audio file')
    args = parser.parse_args()
    try:
        print(transcribe_file(args.input))
        return 0
    except (OSError, VoiceError):
        print('Audio could not be transcribed.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
