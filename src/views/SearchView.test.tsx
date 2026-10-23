import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppStoreProvider, createAppStore, createInitialState } from '../state/AppStore';
import { DEMO_ROOT } from '../platform/demoFs';
import { api } from '../platform';
import { hasHandler, runCommand } from '../commands/registry';
import { SearchView, PreviewText, groupResults } from './SearchView';

const openFileMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../state/actions', () => ({ openFile: openFileMock }));

function renderView(workspace: string | null = DEMO_ROOT) {
  const store = createAppStore(createInitialState({ workspace, sidebarView: 'search' }));
  const utils = render(
    <AppStoreProvider store={store}>
      <SearchView />
    </AppStoreProvider>,
  );
  return { ...utils, store };
}

async function search(query: string) {
  fireEvent.change(screen.getByTestId('search-query'), { target: { value: query } });
  fireEvent.submit(screen.getByTestId('search-form'));
  await waitFor(() => expect(screen.getByTestId('search-summary').textContent).not.toBe('Searching…'));
}

afterEach(() => {
  // reset the remembered form so every test starts empty
  if (screen.queryByTestId('search-query')) {
    fireEvent.change(screen.getByTestId('search-query'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('search-include'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('search-exclude'), { target: { value: '' } });
    for (const id of ['search-toggle-case', 'search-toggle-word', 'search-toggle-regex']) {
      const b = screen.getByTestId(id);
      if (b.getAttribute('aria-pressed') === 'true') fireEvent.click(b);
    }
  }
  cleanup();
  openFileMock.mockClear();
  vi.restoreAllMocks();
});

describe('SearchView', () => {
  it('starts neutral with the form of the design', () => {
    renderView();
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByLabelText('Search text')).toBeTruthy();
    expect(screen.getByLabelText('Files to include')).toBeTruthy();
    expect(screen.getByLabelText('Files to exclude')).toBeTruthy();
    for (const name of ['Match case', 'Whole word', 'Regular expression']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    }
    expect(screen.getByTestId('search-summary').textContent).toBe('Type to search the workspace');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lists results of the demo workspace grouped by file with highlighted previews', async () => {
    renderView();
    await search('cache');
    const groups = screen.getAllByTestId('result-group');
    expect(groups.length).toBeGreaterThan(1);
    const names = groups.map((g) => within(g).getByRole('button', { expanded: true }).querySelector('.result-file-name')?.textContent);
    expect(names).toContain('cache.ts');
    const marks = document.querySelectorAll('mark.hit');
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) expect(m.textContent?.toLowerCase()).toBe('cache');
    expect(screen.getByTestId('search-summary').textContent).toMatch(/^\d+ results? in \d+ files?$/);
  });

  it('opens the file with the match selected on click', async () => {
    renderView();
    await search('cacheGet');
    const line = screen.getAllByTestId('result-line')[0];
    fireEvent.click(line);
    await waitFor(() => expect(openFileMock).toHaveBeenCalled());
    const [path, opts] = openFileMock.mock.calls[0] as unknown as [string, { line: number; selectFrom: number; selectTo: number }];
    const file = await api.fs.readFile(path);
    const text = file.content.replace(/\r\n/g, '\n');
    expect(text.slice(opts.selectFrom, opts.selectTo)).toBe('cacheGet');
    expect(opts.line).toBe(Number(line.getAttribute('data-line')));
    expect(line.className).toContain('is-active');
  });

  it('collapses and expands a file group', async () => {
    renderView();
    await search('cache');
    const group = screen.getAllByTestId('result-group')[0];
    const header = group.querySelector('button.result-file') as HTMLButtonElement;
    fireEvent.click(header);
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(within(group).queryAllByTestId('result-line')).toHaveLength(0);
    fireEvent.click(header);
    expect(group.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the invalid regex error and the empty notice', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Regular expression' }));
    await search('(');
    expect(screen.getByRole('alert').textContent).toBe('Invalid regular expression');
    fireEvent.click(screen.getByRole('button', { name: 'Regular expression' }));
    await search('zzzz-not-in-any-file');
    expect(screen.getByTestId('search-empty')).toBeTruthy();
  });

  it('honours the include pattern', async () => {
    renderView();
    fireEvent.change(screen.getByTestId('search-include'), { target: { value: 'src/api/**' } });
    await search('cache');
    const groups = screen.getAllByTestId('result-group');
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) expect(g.getAttribute('data-path')).toMatch(/\\api\\/);
  });

  it('cancels the previous search when new input arrives', async () => {
    const cancel = vi.spyOn(api.search, 'cancel');
    const run = vi.spyOn(api.search, 'run').mockImplementation(() => new Promise(() => undefined));
    renderView();
    fireEvent.change(screen.getByTestId('search-query'), { target: { value: 'ca' } });
    fireEvent.submit(screen.getByTestId('search-form'));
    const firstId = (run.mock.calls[0][0] as { id: string }).id;
    fireEvent.change(screen.getByTestId('search-query'), { target: { value: 'cac' } });
    expect(cancel).toHaveBeenCalledWith(firstId);
  });

  it('shows the truncated and timeout notices', async () => {
    vi.spyOn(api.search, 'run').mockImplementation(async (req) => ({
      id: req.id,
      files: [{ path: `${DEMO_ROOT}\\a.ts`, matches: [{ line: 1, start: 0, end: 1, preview: 'a' }] }],
      truncated: true,
      timedOut: true,
    }));
    renderView();
    await search('a');
    expect(screen.getByTestId('search-truncated')).toBeTruthy();
    expect(screen.getByTestId('search-timeout')).toBeTruthy();
  });

  it('is visibly disabled with a hint while no folder is open', () => {
    renderView(null);
    expect((screen.getByTestId('search-query') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('search-summary').textContent).toMatch(/Open a folder/);
  });

  it('registers view.workspaceSearch, which shows the view and focuses the query', async () => {
    expect(hasHandler('view.workspaceSearch')).toBe(true);
    const { store } = renderView();
    act(() => {
      store.dispatch({ type: 'sidebar/setView', view: 'explorer' });
      runCommand('view.workspaceSearch');
    });
    expect(store.getState().sidebarView).toBe('search');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('search-query')));
  });
});

describe('PreviewText', () => {
  it('renders matches as marks in text nodes, never as HTML', () => {
    const preview = '<b>x</b> cache';
    const { container } = render(<PreviewText preview={preview} matches={[{ line: 1, start: 9, end: 14, preview }]} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe(preview);
    expect(container.querySelector('mark.hit')?.textContent).toBe('cache');
  });

  it('drops indentation and cuts a long lead', () => {
    const preview = `    ${'x'.repeat(100)}hit`;
    const { container } = render(<PreviewText preview={preview} matches={[{ line: 1, start: 104, end: 107, preview }]} />);
    expect(container.textContent?.startsWith('…')).toBe(true);
    expect(container.textContent?.endsWith('hit')).toBe(true);
  });
});

describe('groupResults', () => {
  it('groups by file and by line with relative folder names', () => {
    const groups = groupResults(
      {
        id: 'x',
        truncated: false,
        timedOut: false,
        files: [
          {
            path: 'C:\\ws\\src\\a.ts',
            matches: [
              { line: 2, start: 0, end: 1, preview: 'aa' },
              { line: 2, start: 1, end: 2, preview: 'aa' },
              { line: 5, start: 0, end: 1, preview: 'a' },
            ],
          },
        ],
      },
      'C:\\ws',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'a.ts', dir: 'src', count: 3 });
    expect(groups[0].lines.map((l) => l.line)).toEqual([2, 5]);
  });
});
