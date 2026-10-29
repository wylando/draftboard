import { Tabs } from '@ark-ui/react/tabs';
import { useState } from 'react';
import { css, cx } from 'styled-system/css';
import { tabs } from 'styled-system/recipes';
import { Button, icons } from '../design-system';
import { CanvasSection } from './CanvasSection';
import { GettingStartedSection } from './GettingStartedSection';
import { ShortcutsSection } from './ShortcutsSection';
import { SymbolsSection } from './SymbolsSection';

type SectionId = 'shortcuts' | 'canvas' | 'guide' | 'symbols';

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'guide', label: 'Getting started' },
  { id: 'symbols', label: 'Symbols' },
];

const pageClass = css({ display: 'flex', flexDirection: 'column', height: 'full' });
const headerClass = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  height: 'toolbarHeight',
  paddingInline: '2',
  bg: 'bg.topBar',
  color: 'text.onToolbar',
  boxShadow: '[inset 0 -1px 0 0 var(--colors-border)]',
});
const titleClass = css({ textStyle: 'heading.page' });
const tabsClasses = tabs();
const bodyClass = css({ flex: '1' });
const navClass = css({
  width: 'sidebarWidth',
  padding: '3',
  borderRightWidth: '1px',
  borderRightStyle: 'solid',
  borderRightColor: 'border',
});
const mainClass = css({
  flex: '1',
  minWidth: '0',
  overflowY: 'auto',
  paddingBlock: '6',
  paddingInline: '6',
  textStyle: 'body.large',
  '& h1': { margin: '0', marginBottom: '2', textStyle: 'heading.title' },
});
const innerClass = css({ maxWidth: 'content', marginInline: 'auto' });

// Deep-link slugs (`#/settings/<slug>`); the guide's id predates its public name.
const SLUGS: Record<string, SectionId> = {
  shortcuts: 'shortcuts',
  canvas: 'canvas',
  'getting-started': 'guide',
  symbols: 'symbols',
};

/** `section` is a deep-link slug; an unknown one opens the default section. The page is keyed by it, so a new link remounts. */
export function SettingsPage({ onClose, section: slug }: { onClose: () => void; section: string | null }) {
  const [section, setSection] = useState<SectionId>((slug !== null && Object.hasOwn(SLUGS, slug) ? SLUGS[slug] : undefined) ?? 'shortcuts');

  return (
    <div className={pageClass} data-testid="settings-page">
      <header className={headerClass}>
        <Button variant="toolbar" data-testid="close-settings" onClick={onClose}>
          <icons.back /> Back to canvas
        </Button>
        <span className={titleClass}>Settings</span>
      </header>
      {/* Only the open section is mounted, so hidden sections never answer queries. */}
      <Tabs.Root
        className={cx(tabsClasses.root, bodyClass)}
        orientation="vertical"
        value={section}
        onValueChange={({ value }) => setSection(value as SectionId)}
        lazyMount
        unmountOnExit
      >
        <Tabs.List className={cx(tabsClasses.list, navClass)} aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <Tabs.Trigger key={s.id} value={s.id} className={tabsClasses.trigger} data-testid={`nav-${s.id}`}>
              {s.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <main className={mainClass}>
          <Tabs.Content value="shortcuts" className={tabsClasses.content}>
            <div className={innerClass}>
              <ShortcutsSection />
            </div>
          </Tabs.Content>
          <Tabs.Content value="canvas" className={tabsClasses.content}>
            <div className={innerClass}>
              <CanvasSection />
            </div>
          </Tabs.Content>
          <Tabs.Content value="guide" className={tabsClasses.content}>
            <div className={innerClass}>
              <GettingStartedSection />
            </div>
          </Tabs.Content>
          <Tabs.Content value="symbols" className={tabsClasses.content}>
            <div className={innerClass}>
              <SymbolsSection />
            </div>
          </Tabs.Content>
        </main>
      </Tabs.Root>
    </div>
  );
}
