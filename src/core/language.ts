import type { LanguageId } from '../types';

const BY_EXT: Record<string, LanguageId> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  html: 'html', htm: 'html', xhtml: 'html',
  css: 'css',
  md: 'markdown', markdown: 'markdown',
  py: 'python', pyw: 'python', pyi: 'python',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  java: 'java',
  go: 'go',
  rs: 'rust',
};

/** Maps a file path to its language mode by extension. */
export function detectLanguage(path: string): LanguageId {
  if (!path) return 'plaintext';
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'plaintext';
  return BY_EXT[name.slice(dot + 1).toLowerCase()] ?? 'plaintext';
}
