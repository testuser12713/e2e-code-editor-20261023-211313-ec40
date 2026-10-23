import { Compartment, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting, type LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { LanguageId } from '../types';

/** Display names of the language modes (status bar, language picker). */
export const LANGUAGE_NAMES: Record<LanguageId, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  python: 'Python',
  cpp: 'C/C++',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  plaintext: 'Plain Text',
};

/** Every language mode, in picker order. */
export const LANGUAGE_IDS = Object.keys(LANGUAGE_NAMES) as LanguageId[];

type Loader = () => Promise<LanguageSupport>;
const LOADERS: Partial<Record<LanguageId, Loader>> = {
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  typescript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true, jsx: true })),
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  markdown: () => import('@codemirror/lang-markdown').then((m) => m.markdown()),
  python: () => import('@codemirror/lang-python').then((m) => m.python()),
  cpp: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  java: () => import('@codemirror/lang-java').then((m) => m.java()),
  go: () => import('@codemirror/lang-go').then((m) => m.go()),
  rust: () => import('@codemirror/lang-rust').then((m) => m.rust()),
};

const cache = new Map<LanguageId, Promise<LanguageSupport>>();

/** Loads (once) the CodeMirror support for a mode; null for plain text. */
export function loadLanguage(id: LanguageId): Promise<LanguageSupport | null> {
  const loader = LOADERS[id];
  if (!loader) return Promise.resolve(null);
  let p = cache.get(id);
  if (!p) {
    p = loader();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** The compartment holding the language of an editor; reconfigure it to switch modes. */
export const languageCompartment = new Compartment();

/** Switches the language of a live editor (lazy-loads the mode). */
export async function setEditorLanguage(view: EditorView, id: LanguageId): Promise<void> {
  const support = await loadLanguage(id);
  view.dispatch({ effects: languageCompartment.reconfigure(support ?? []) });
}

/**
 * The CodeMirror language support for a mode (empty for plain text). The
 * grammar is lazy-loaded and swapped into the compartment once it arrives.
 */
export function languageExtension(id: LanguageId): Extension {
  if (!LOADERS[id]) return languageCompartment.of([]);
  const loader = ViewPlugin.define((view) => {
    let alive = true;
    loadLanguage(id).then(
      (support) => {
        if (alive && support) view.dispatch({ effects: languageCompartment.reconfigure(support) });
      },
      (err: unknown) => console.warn('language load failed', id, err instanceof Error ? err.message : err),
    );
    return { destroy: () => { alive = false; } };
  });
  return [languageCompartment.of([]), loader];
}

const style = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--syn-kw)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--syn-str)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--syn-fn)' },
  { tag: [t.typeName, t.className, t.namespace, t.tagName, t.heading], color: 'var(--syn-type)' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--syn-prop)' },
  { tag: t.heading, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.link, textDecoration: 'underline' },
]);

/**
 * Syntax highlighting bound to the design's --syn-* colour tokens, so it
 * follows the light and dark theme.
 */
export function highlightExtension(): Extension {
  return syntaxHighlighting(style);
}
