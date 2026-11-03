// Extracted from a larger private codebase (CALLIOPE). Source: apps/api/src/config/paths.ts; adapted: explicit workspace root and configuration port replace NestJS ConfigService.
import * as path from 'node:path';
export interface PathConfig { get(key: string): string | undefined }
export function getWorkspaceRoot(base: string): string { return path.resolve(base); }
export function getDocumentConverterPath(config: PathConfig, root: string): string {
  return config.get('DOCUMENT_CONVERTER_PATH') ?? path.join(root, 'services/document/convert.py');
}
export function getVoicePythonPath(config: PathConfig, root: string): string {
  return config.get('VOICE_PYTHON_PATH') ?? path.join(root, 'services/voice/.venv/bin/python');
}
export function getDocumentPythonPath(config: PathConfig, root: string): string {
  return config.get('DOCUMENT_PYTHON_PATH') ?? path.join(root, 'services/document/.venv/bin/python');
}
