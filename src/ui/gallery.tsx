/**
 * UI kit gallery — every kit component in every state, in the light and the
 * dark theme side by side. Development only: App.tsx loads this module through
 * an `import.meta.env.DEV` glob at `#/gallery`, so it never enters the
 * production bundle.
 */
import { useState, type ReactNode } from 'react';
import './gallery.css';
import { cn } from './cn';
import { Icon, ICON_NAMES } from './Icon';
import { ActivityButton, Badge, Button, IconButton, Keys, ToggleButton, type ButtonVariant } from './Button';
import { Switch, TextInput } from './Input';
import { Select } from './Select';
import { Field, FieldError, FieldLabel, InputGroup, SettingRow, SettingsGroup } from './FormField';
import { Dialog, Scrim } from './Dialog';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import { HighlightedText, ListRow, OverlayEmpty, OverlayFooter, OverlayHeading, OverlayHint, OverlayInput, OverlayList, OverlayListBox } from './OverlayList';
import { Banner } from './Banner';
import { Toast } from './Toast';
import { TabItem } from './Tab';
import { Tree, TreeInputRow, TreeItem, TreeRow } from './Tree';
import { EmptyState } from './EmptyState';
import { SidebarBody, SidebarHeader, SidebarSubtitle } from './Sidebar';
import { Resizer } from './Resizer';
import { ActivityBar, ActivitySpacer, MenuBar, MenuBarEntry, MenuBarItem, StatusBarFrame, StatusGroup, StatusItem, TitleBar } from './Chrome';

type Theme = 'light' | 'dark';
type Act = (what: string) => void;

/** The pinned states shown for pointer and keyboard interaction. */
const STATES = [
  { id: 'idle', className: undefined },
  { id: 'hover', className: 'is-hover' },
  { id: 'focus', className: 'is-focus' },
  { id: 'active', className: 'is-pressed' },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-section" data-testid={`gallery-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery-cell">
      <span className="gallery-caption">{caption}</span>
      {children}
    </div>
  );
}

function ButtonsSection({ act }: { act: Act }) {
  const variants: ButtonVariant[] = ['default', 'primary', 'ghost', 'danger'];
  return (
    <Section title="Buttons">
      {variants.map((variant) => (
        <div className="gallery-row" key={variant}>
          {STATES.map((s) => (
            <Cell caption={`${variant} · ${s.id}`} key={s.id}>
              <Button variant={variant} className={s.className} onClick={() => act(`${variant} button`)}>
                {variant === 'primary' ? 'Save' : variant === 'danger' ? 'Delete' : variant === 'ghost' ? 'Cancel' : "Don't Save"}
              </Button>
            </Cell>
          ))}
          <Cell caption={`${variant} · disabled`}>
            <Button variant={variant} disabled>
              Unavailable
            </Button>
          </Cell>
        </div>
      ))}
      <div className="gallery-row">
        <Cell caption="small">
          <Button size="sm" onClick={() => act('small button')}>
            Keep mine
          </Button>
        </Cell>
        <Cell caption="small primary">
          <Button size="sm" variant="primary" onClick={() => act('small primary button')}>
            Reload
          </Button>
        </Cell>
        <Cell caption="with keys">
          <Button variant="primary" onClick={() => act('open folder')}>
            Open Folder <Keys shortcut="Ctrl+K Ctrl+O" />
          </Button>
        </Cell>
      </div>
    </Section>
  );
}

function IconButtonsSection({ act }: { act: Act }) {
  const [activity, setActivity] = useState<'files' | 'search' | 'settings'>('files');
  return (
    <Section title="Icon and activity buttons">
      <div className="gallery-row">
        {STATES.map((s) => (
          <Cell caption={`icon · ${s.id}`} key={s.id}>
            <IconButton icon="arrow-down" label="Next match" className={s.className} onClick={() => act('next match')} />
          </Cell>
        ))}
        <Cell caption="icon · disabled">
          <IconButton icon="arrow-up" label="Previous match" disabled />
        </Cell>
      </div>
      <div className="gallery-row">
        {STATES.map((s) => (
          <Cell caption={`activity · ${s.id}`} key={s.id}>
            <div style={{ width: 44, background: 'var(--c-titlebar)' }}>
              <ActivityButton icon="search" label="Search (Ctrl+Shift+F)" className={s.className} onClick={() => act('activity search')} />
            </div>
          </Cell>
        ))}
        <Cell caption="activity · selected">
          <div style={{ width: 44, background: 'var(--c-titlebar)' }}>
            {(['files', 'search', 'settings'] as const).map((icon) => (
              <ActivityButton key={icon} icon={icon} label={`Show ${icon}`} current={activity === icon} onClick={() => setActivity(icon)} />
            ))}
          </div>
        </Cell>
      </div>
      <div className="gallery-row" role="group" aria-label="Icons">
        {ICON_NAMES.map((name) => (
          <Cell caption={name} key={name}>
            <Icon name={name} />
          </Cell>
        ))}
      </div>
    </Section>
  );
}

function TogglesSection() {
  const [pressed, setPressed] = useState({ cs: false, word: true, regex: false });
  return (
    <Section title="Toggle buttons">
      <div className="gallery-row">
        <Cell caption="off / on (click)">
          <div className="gallery-row">
            <ToggleButton label="Match case" pressed={pressed.cs} onPressedChange={(v) => setPressed((p) => ({ ...p, cs: v }))}>
              Aa
            </ToggleButton>
            <ToggleButton label="Whole word" pressed={pressed.word} onPressedChange={(v) => setPressed((p) => ({ ...p, word: v }))}>
              ab
            </ToggleButton>
            <ToggleButton label="Regular expression" pressed={pressed.regex} onPressedChange={(v) => setPressed((p) => ({ ...p, regex: v }))}>
              .*
            </ToggleButton>
          </div>
        </Cell>
        <Cell caption="hover">
          <ToggleButton label="Match case (hover)" pressed={pressed.cs} className="is-hover" onPressedChange={(v) => setPressed((p) => ({ ...p, cs: v }))}>
            Aa
          </ToggleButton>
        </Cell>
        <Cell caption="focus">
          <ToggleButton label="Match case (focus)" pressed={pressed.word} className="is-focus" onPressedChange={(v) => setPressed((p) => ({ ...p, word: v }))}>
            Aa
          </ToggleButton>
        </Cell>
        <Cell caption="disabled">
          <ToggleButton label="Match case (disabled)" pressed={false} disabled>
            Aa
          </ToggleButton>
        </Cell>
      </div>
      <div className="gallery-row">
        <Badge>LF</Badge>
        <Badge tone="accent">3</Badge>
        <Badge tone="warn">read-only</Badge>
        <Keys shortcut="Ctrl+Shift+P" />
      </div>
    </Section>
  );
}

function InputsSection({ prefix }: { prefix: string }) {
  const [text, setText] = useState('cache');
  const [touched, setTouched] = useState(false);
  const [theme, setTheme] = useState('system');
  const [wrap, setWrap] = useState(true);
  const invalid = touched && text.trim() === '';
  return (
    <Section title="Inputs, input group, labels and errors">
      <div className="gallery-row">
        <Cell caption="idle">
          <TextInput aria-label="Idle input" placeholder="Find" value={text} onChange={(e) => setText(e.currentTarget.value)} />
        </Cell>
        <Cell caption="focus">
          <TextInput aria-label="Focused input" className="is-focus" value="forecast" readOnly />
        </Cell>
        <Cell caption="disabled">
          <TextInput aria-label="Disabled input" value="locked" disabled />
        </Cell>
        <Cell caption="mono">
          <TextInput aria-label="Include glob" mono value="src/**/*.ts" readOnly />
        </Cell>
      </div>
      <div className="gallery-row">
        <Cell caption="input group">
          <InputGroup>
            <TextInput aria-label="Find in group" value="cache" readOnly />
            <ToggleButton label="Match case in group" pressed={false} disabled>
              Aa
            </ToggleButton>
          </InputGroup>
        </Cell>
        <Cell caption="input group · focus">
          <InputGroup className="is-focus">
            <TextInput aria-label="Find in focused group" value="cache" readOnly />
          </InputGroup>
        </Cell>
        <Cell caption="input group · error">
          <InputGroup invalid>
            <TextInput aria-label="Invalid regex" value="(cache" invalid readOnly />
          </InputGroup>
          <FieldError>Invalid regular expression: missing )</FieldError>
        </Cell>
      </div>
      <div className="gallery-row">
        <Cell caption="field (error after touch)">
          <Field label="Files to include" htmlFor={`${prefix}-include`} error={invalid ? 'Enter a pattern.' : undefined}>
            <TextInput
              id={`${prefix}-include`}
              mono
              value={text}
              invalid={invalid}
              onChange={(e) => setText(e.currentTarget.value)}
              onBlur={() => setTouched(true)}
            />
          </Field>
        </Cell>
        <Cell caption="field label">
          <FieldLabel htmlFor={`${prefix}-exclude`}>Files to exclude</FieldLabel>
          <TextInput id={`${prefix}-exclude`} mono placeholder="e.g. dist/**" />
        </Cell>
      </div>
      <div className="gallery-row">
        <Cell caption="select">
          <Select
            aria-label="Theme"
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </Cell>
        <Cell caption="select · focus">
          <Select aria-label="Tab size (focus)" className="is-focus" value="2" options={[{ value: '2', label: '2' }]} />
        </Cell>
        <Cell caption="select · disabled">
          <Select aria-label="Tab size (disabled)" disabled value="4" options={[{ value: '4', label: '4' }]} />
        </Cell>
        <Cell caption="switch">
          <Switch aria-label="Word wrap" checked={wrap} onCheckedChange={setWrap} />
        </Cell>
        <Cell caption="switch · disabled">
          <Switch aria-label="Line numbers (disabled)" checked={false} disabled />
        </Cell>
      </div>
    </Section>
  );
}

function SettingsSection({ prefix }: { prefix: string }) {
  const [size, setSize] = useState('13');
  const [spaces, setSpaces] = useState(true);
  const [tab, setTab] = useState('2');
  return (
    <Section title="Settings group and setting row">
      <div className="gallery-sidebar settings-form">
        <SettingsGroup id={`${prefix}-set-editor`} title="Editor">
          <SettingRow label="Font size" htmlFor={`${prefix}-size`} description="In pixels, 8 to 32.">
            <TextInput id={`${prefix}-size`} type="number" mono min={8} max={32} value={size} onChange={(e) => setSize(e.currentTarget.value)} />
          </SettingRow>
          <SettingRow label="Tab size" htmlFor={`${prefix}-tab`}>
            <Select
              id={`${prefix}-tab`}
              value={tab}
              onValueChange={setTab}
              options={['2', '4', '8'].map((v) => ({ value: v, label: v }))}
            />
          </SettingRow>
          <SettingRow label="Insert spaces" htmlFor={`${prefix}-spaces`} description="Use spaces instead of tab characters.">
            <Switch id={`${prefix}-spaces`} checked={spaces} onCheckedChange={setSpaces} />
          </SettingRow>
        </SettingsGroup>
      </div>
    </Section>
  );
}

function DialogSection({ act }: { act: Act }) {
  return (
    <Section title="Modal dialog with action row">
      <div className="gallery-stage">
        <Scrim />
        <Dialog
          role="alertdialog"
          title="Save changes to args.ts?"
          autoFocus={false}
          actions={
            <>
              <Button variant="ghost" onClick={() => act('dialog cancel')}>
                Cancel
              </Button>
              <Button onClick={() => act("dialog don't save")}>Don&apos;t Save</Button>
              <Button variant="primary" onClick={() => act('dialog save')}>
                Save
              </Button>
            </>
          }
        >
          Your changes will be lost if you don&apos;t save them.
        </Dialog>
      </div>
    </Section>
  );
}

function MenuSection({ act }: { act: Act }) {
  return (
    <Section title="Popup and context menu">
      <div className="gallery-stage gallery-stage-tall">
        <Menu label="Explorer actions">
          <MenuItem label="New File…" onSelect={() => act('new file')} />
          <MenuItem label="New Folder…" className="is-hover" onSelect={() => act('new folder')} />
          <MenuSeparator />
          <MenuItem label="Rename…" shortcut="F2" onSelect={() => act('rename')} />
          <MenuItem label="Delete" shortcut="Del" danger onSelect={() => act('delete')} />
          <MenuSeparator />
          <MenuItem label="LF" checked onSelect={() => act('lf')} />
          <MenuItem label="CRLF" checked={false} onSelect={() => act('crlf')} />
          <MenuItem label="Reveal in File Explorer" disabled disabledReason="Desktop app only" />
        </Menu>
      </div>
    </Section>
  );
}

function OverlaySection({ act }: { act: Act }) {
  const files = [
    { name: 'cache.ts', dir: 'src\\api', hits: [0, 1] },
    { name: 'forecast.ts', dir: 'src\\api', hits: [] as number[] },
    { name: 'args.ts', dir: 'src\\cli', hits: [] as number[] },
  ];
  const [sel, setSel] = useState(0);
  return (
    <Section title="Overlay list and list rows">
      <div className="gallery-stage gallery-stage-tall">
        <OverlayList label="Quick Open (gallery)">
          <OverlayInput label="Search files by name" placeholder="Search files by name" defaultValue="ca" />
          <OverlayListBox label="Files">
            <OverlayHeading>Recently opened</OverlayHeading>
            {files.map((f, i) => (
              <ListRow
                key={f.name}
                title={<HighlightedText text={f.name} indices={f.hits} />}
                subtitle={f.dir}
                selected={sel === i}
                className={i === 2 && sel !== 2 ? 'is-hover' : undefined}
                onSelect={() => {
                  setSel(i);
                  act(`open ${f.name}`);
                }}
              />
            ))}
            <ListRow title="View: Toggle Word Wrap" shortcut="Alt+Z" onSelect={() => act('toggle word wrap')} />
          </OverlayListBox>
          <OverlayFooter
            hints={[
              { keys: 'Up Down', label: 'navigate' },
              { keys: 'Enter', label: 'open' },
              { keys: 'Esc', label: 'close' },
            ]}
          />
        </OverlayList>
      </div>
      <div className="gallery-row">
        <Cell caption="empty">
          <div className="gallery-frame" style={{ width: 280 }}>
            <OverlayEmpty>No matching files</OverlayEmpty>
          </div>
        </Cell>
        <Cell caption="hint · error">
          <div className="gallery-frame" style={{ width: 280 }}>
            <OverlayHint>Current line: 30 of 37</OverlayHint>
            <OverlayHint invalid>Enter a line number between 1 and 37.</OverlayHint>
          </div>
        </Cell>
      </div>
    </Section>
  );
}

function BannerToastSection({ act }: { act: Act }) {
  const [toast, setToast] = useState<string | null>('Saved forecast.ts');
  return (
    <Section title="Banner and toast">
      <div className="gallery-frame">
        <Banner
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => act('reload')}>
                Reload
              </Button>
              <Button size="sm" onClick={() => act('keep mine')}>
                Keep mine
              </Button>
            </>
          }
        >
          <strong>args.ts</strong> was changed on disk by another program, and you have unsaved changes here.
        </Banner>
        <Banner icon="lock">
          <strong>Read-only:</strong> archive-2025.json is 12.4 MB, above the 5 MB limit.
        </Banner>
      </div>
      <div className="gallery-stage" style={{ minHeight: 90 }}>
        {toast ? <Toast onDismiss={() => setToast(null)}>{toast}</Toast> : null}
        <div style={{ padding: 'var(--space-3)' }}>
          <Button size="sm" onClick={() => setToast('Recent workspaces cleared')}>
            Show toast
          </Button>
        </div>
      </div>
    </Section>
  );
}

function TabsSection({ act }: { act: Act }) {
  return (
    <Section title="Tab item states">
      <div className="tabbar" role="tablist" aria-label="Gallery tabs">
        <TabItem name="forecast.ts" title="src\api\forecast.ts" active onSelect={() => act('tab forecast')} onClose={() => act('close forecast')} />
        <TabItem name="args.ts" dirty onSelect={() => act('tab args')} onClose={() => act('close args')} />
        <TabItem name="package.json" preview onSelect={() => act('tab package')} onClose={() => act('close package')} />
        <TabItem name="archive.json" readOnly onSelect={() => act('tab archive')} onClose={() => act('close archive')} />
        <TabItem name="hover.ts" className="is-hover" onSelect={() => act('tab hover')} onClose={() => act('close hover')} />
        <TabItem name="drag.ts" dragging onSelect={() => act('tab drag')} onClose={() => act('close drag')} />
        <TabItem name="drop.ts" dropTarget onSelect={() => act('tab drop')} onClose={() => act('close drop')} />
      </div>
    </Section>
  );
}

function TreeSection({ act }: { act: Act }) {
  const [open, setOpen] = useState(true);
  return (
    <Section title="Sidebar, tree and tree rows">
      <div className="gallery-row" style={{ alignItems: 'flex-start' }}>
        <div className="gallery-sidebar">
          <SidebarHeader title="Explorer" actions={<IconButton icon="file" label="New File" onClick={() => act('new file')} />} />
          <SidebarSubtitle title="C:\Demo\weather-cli">weather-cli</SidebarSubtitle>
          <SidebarBody>
            <Tree label="Files in weather-cli (gallery)">
              <TreeItem
                expanded={open}
                row={<TreeRow name="src" kind="dir" depth={0} onClick={() => setOpen((o) => !o)} />}
              >
                <TreeItem row={<TreeRow name="forecast.ts" kind="file" depth={1} active onClick={() => act('open forecast')} />} />
                <TreeItem row={<TreeRow name="cache.ts" kind="file" depth={1} menuTarget onClick={() => act('open cache')} />} />
                <TreeItem row={<TreeRow name="index.ts" kind="file" depth={1} className="is-hover" onClick={() => act('open index')} />} />
                <TreeItem row={<TreeRow name="types.ts" kind="file" depth={1} className="is-focus" onClick={() => act('open types')} />} />
                <TreeInputRow depth={1} label="New file name" defaultValue="untitled.ts" />
              </TreeItem>
              <TreeItem expanded={false} row={<TreeRow name="test" kind="dir" depth={0} onClick={() => act('expand test')} />} />
              <TreeItem row={<TreeRow name="README.md" kind="file" depth={0} onClick={() => act('open readme')} />} />
            </Tree>
          </SidebarBody>
        </div>
        <div className="gallery-sidebar">
          <SidebarHeader title="Explorer" />
          <SidebarBody>
            <EmptyState title="No folder opened" action={<Button size="sm" variant="primary" onClick={() => act('open folder')}>Open Folder</Button>}>
              Open a folder to browse its files and search across them.
            </EmptyState>
          </SidebarBody>
        </div>
      </div>
    </Section>
  );
}

function ChromeSection({ act }: { act: Act }) {
  const [width, setWidth] = useState(120);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <Section title="Shell chrome and resizer">
      <div className="gallery-frame">
        <TitleBar
          testId="gallery-title-bar"
          title="● forecast.ts — Code Editor"
          menu={
            <MenuBar label="Gallery menu">
              <MenuBarEntry>
                <MenuBarItem expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                  File
                </MenuBarItem>
              </MenuBarEntry>
              <MenuBarEntry>
                <MenuBarItem expanded={false} className="is-hover" onClick={() => act('menu edit')}>
                  Edit
                </MenuBarItem>
              </MenuBarEntry>
              <MenuBarEntry>
                <MenuBarItem expanded={false} className="is-focus" onClick={() => act('menu view')}>
                  View
                </MenuBarItem>
              </MenuBarEntry>
            </MenuBar>
          }
        />
        <div className="gallery-shell">
          <ActivityBar label="Gallery views" testId="gallery-activity-bar">
            <ActivityButton icon="files" label="Explorer" current onClick={() => act('explorer')} />
            <ActivityButton icon="search" label="Search" onClick={() => act('search')} />
            <ActivitySpacer />
            <ActivityButton icon="settings" label="Settings" onClick={() => act('settings')} />
          </ActivityBar>
          <div className="gallery-pane-side" style={{ width }} />
          <Resizer value={width} min={60} max={240} onResize={setWidth} label="Resize gallery pane" />
          <div className="gallery-pane" />
        </div>
        <StatusBarFrame testId="gallery-status-bar">
          <StatusGroup>
            <StatusItem>Ln 30, Col 22</StatusItem>
          </StatusGroup>
          <StatusGroup>
            <StatusItem icon="lock">Read-only</StatusItem>
            <StatusItem title="Change language mode" onPress={() => act('language')}>
              TypeScript
            </StatusItem>
            <StatusItem title="Change indentation" className="is-hover" onPress={() => act('indent')}>
              Spaces: 2
            </StatusItem>
            <StatusItem title="Toggle line ending" className="is-focus" onPress={() => act('eol')}>
              LF
            </StatusItem>
            <StatusItem title="Encoding">UTF-8</StatusItem>
          </StatusGroup>
        </StatusBarFrame>
      </div>
      <div className="gallery-row">
        <Cell caption="resizer · idle / hover / dragging">
          <div className="gallery-resizer-demo">
            <div style={{ width: 40 }} />
            <Resizer value={40} min={40} max={40} onResize={() => act('resize')} label="Idle resizer" />
            <div style={{ width: 40 }} />
            <Resizer value={40} min={40} max={40} onResize={() => act('resize')} label="Hover resizer" className="is-hover" />
            <div style={{ width: 40 }} />
            <Resizer value={40} min={40} max={40} onResize={() => act('resize')} label="Focused resizer" className="is-focus" />
            <div style={{ width: 40 }} />
          </div>
        </Cell>
      </div>
    </Section>
  );
}

function ThemePanel({ theme, act }: { theme: Theme; act: Act }) {
  return (
    <div className={cn('gallery-theme', theme === 'dark' ? 'theme-dark' : 'theme-light')} data-testid={`gallery-${theme}`}>
      <h2>{theme === 'dark' ? 'Dark' : 'Light'}</h2>
      <ButtonsSection act={act} />
      <IconButtonsSection act={act} />
      <TogglesSection />
      <InputsSection prefix={theme} />
      <SettingsSection prefix={theme} />
      <DialogSection act={act} />
      <MenuSection act={act} />
      <OverlaySection act={act} />
      <BannerToastSection act={act} />
      <TabsSection act={act} />
      <TreeSection act={act} />
      <ChromeSection act={act} />
    </div>
  );
}

/** The gallery page: both themes, every component, every state. */
export default function Gallery() {
  const [last, setLast] = useState('none');
  return (
    <div className="gallery" data-testid="ui-gallery">
      <header className="gallery-head theme-light">
        <h1>UI kit gallery</h1>
        <span className="muted" aria-live="polite" data-testid="gallery-last-action">
          Last action: {last}
        </span>
        <Button
          size="sm"
          onClick={() => {
            window.location.hash = '';
          }}
        >
          Back to the app
        </Button>
      </header>
      <div className="gallery-themes">
        <ThemePanel theme="light" act={setLast} />
        <ThemePanel theme="dark" act={setLast} />
      </div>
    </div>
  );
}
