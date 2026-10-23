/** Path allow-list (AC-21) and argument validation (AC-22). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);
const security = nodeRequire('./security.cjs');
const validate = nodeRequire('./validate.cjs');

let tmp: string;
let ws: string;
let outside: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sec-')));
  ws = path.join(tmp, 'ws');
  outside = path.join(tmp, 'outside');
  fs.mkdirSync(path.join(ws, 'sub'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(ws, 'a.txt'), 'a');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 's');
  security.resetAllowed();
});
afterEach(() => {
  security.resetAllowed();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('assertAllowedPath', () => {
  it('rejects everything before a root is chosen', () => {
    expect(() => security.assertAllowedPath(path.join(ws, 'a.txt'))).toThrow('path-not-allowed');
  });

  it('allows paths inside the workspace, including not-yet-existing ones', () => {
    security.allowRoot(ws);
    expect(security.assertAllowedPath(path.join(ws, 'a.txt'))).toBe(path.join(ws, 'a.txt'));
    expect(security.assertAllowedPath(ws)).toBe(ws);
    expect(() => security.assertAllowedPath(path.join(ws, 'sub', 'new.txt'))).not.toThrow();
  });

  it('rejects .. escapes and siblings sharing a prefix', () => {
    security.allowRoot(ws);
    expect(() => security.assertAllowedPath(path.join(ws, '..', 'outside', 'secret.txt'))).toThrow('path-not-allowed');
    expect(() => security.assertAllowedPath(path.join(ws, 'sub', '..', '..'))).toThrow('path-not-allowed');
    fs.mkdirSync(ws + '2');
    expect(() => security.assertAllowedPath(path.join(ws + '2', 'x'))).toThrow('path-not-allowed');
  });

  it('rejects a symlink inside the workspace pointing outside', () => {
    security.allowRoot(ws);
    try {
      fs.symlinkSync(outside, path.join(ws, 'link'), 'junction');
    } catch {
      return; // platform without symlink permission
    }
    expect(() => security.assertAllowedPath(path.join(ws, 'link', 'secret.txt'))).toThrow('path-not-allowed');
    expect(() => security.assertAllowedPath(path.join(ws, 'link', 'new.txt'))).toThrow('path-not-allowed');
  });

  it('allows exactly a dialog-chosen path, not its folder', () => {
    const file = path.join(outside, 'secret.txt');
    security.allowPath(file);
    expect(security.assertAllowedPath(file)).toBe(file);
    expect(() => security.assertAllowedPath(path.join(outside, 'other.txt'))).toThrow('path-not-allowed');
  });

  it('rejects wrong types and NUL bytes', () => {
    security.allowRoot(ws);
    for (const bad of [undefined, null, 42, {}, [], '', path.join(ws, 'a\0b')]) {
      expect(() => security.assertAllowedPath(bad)).toThrow('path-not-allowed');
    }
  });
});

describe('validate', () => {
  it('checks paths', () => {
    expect(validate.assertPath('C:\\x')).toBe('C:\\x');
    for (const bad of [undefined, 1, '', 'a\0', {}, 'x'.repeat(validate.MAX_PATH + 1)]) {
      expect(() => validate.assertPath(bad)).toThrow('invalid-argument');
    }
  });
  it('checks booleans and content', () => {
    expect(validate.assertBoolean(false)).toBe(false);
    expect(() => validate.assertBoolean('true')).toThrow('invalid-argument');
    expect(validate.assertContent('')).toBe('');
    expect(() => validate.assertContent(5)).toThrow('invalid-argument');
  });
  it('limits the search query to 500 characters', () => {
    const req = { id: '1', root: '/r', query: 'q', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '' };
    expect(() => validate.assertSearchRequest(req)).not.toThrow();
    expect(() => validate.assertSearchRequest({ ...req, query: 'x'.repeat(501) })).toThrow('invalid-argument');
    expect(() => validate.assertSearchRequest({ ...req, regex: 'yes' })).toThrow('invalid-argument');
  });
});
