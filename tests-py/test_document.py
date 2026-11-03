# Extracted from a larger private codebase (CALLIOPE). Source: services/document/convert.py:71-157; adapted: isolated synthetic fixtures.
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('convert', Path(__file__).resolve().parents[1] / 'services/document/convert.py')
convert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(convert)

class DocumentTests(unittest.TestCase):
    def test_text_conversion_and_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'sample.txt'
            source.write_text('Synthetic content', encoding='utf-8')
            self.assertEqual(convert.convert_document(str(source), str(root / 'out')), 0)
            self.assertIn('Synthetic content', (root / 'out/sample.md').read_text())
            data = json.loads((root / 'out/sample.json').read_text())
            self.assertEqual(data['document']['converter'], 'plain-text-fallback')

    def test_missing_and_invalid_utf8(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(convert.convert_document(str(root / 'missing.txt'), str(root / 'out')), 1)
            source = root / 'bad.txt'
            source.write_bytes(b'\xff')
            self.assertEqual(convert.convert_document(str(source), str(root / 'out')), 1)

if __name__ == '__main__':
    unittest.main()
