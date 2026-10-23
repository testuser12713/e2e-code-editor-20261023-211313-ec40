/**
 * Opens a file in a tab (reading it through the bridge, detecting language,
 * line ending and indentation), optionally jumping to a line or selecting a
 * range. Uses the module-level `appStore` handle, so it can be called from
 * anywhere (explorer, quick open, search results, command handlers).
 *
 * Skeleton: final signature, inert body — filled by "Implement tabs and the
 * CodeMirror editor host".
 */
export interface OpenFileOptions {
  /** 1-based line to reveal. */
  line?: number;
  /** Document offsets of a range to select (e.g. a search match). */
  selectFrom?: number;
  selectTo?: number;
  /** Open as an italic preview tab (single click). Defaults to false. */
  preview?: boolean;
}

export async function openFile(path: string, opts: OpenFileOptions = {}): Promise<void> {
  void path;
  void opts;
}
