import { useState } from 'react';
import { css } from 'styled-system/css';
import { Button, icons, NavItem } from '../design-system';
import { GettingStartedSection } from './GettingStartedSection';
import { ShortcutsSection } from './ShortcutsSection';

type SectionId = 'shortcuts' | 'guide';

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'guide', label: 'Getting started' },
];

const pageClass = css({ display: 'flex', flexDirection: 'column', height: 'full' });
const headerClass = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  height: 'toolbarHeight',
  paddingInline: '2',
  bg: 'bg.toolbar',
  color: 'text.onToolbar',
});
const titleClass = css({ textStyle: 'body.largeStrong' });
const bodyClass = css({ flex: '1', display: 'flex', minHeight: '0' });
const navClass = css({
  flex: 'none',
  width: 'sidebarWidth',
  padding: '3',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  borderRightWidth: '1px',
  borderRightStyle: 'solid',
  borderRightColor: 'border',
});
const contentClass = css({
  flex: '1',
  overflowY: 'auto',
  paddingBlock: '6',
  paddingInline: '6',
  '& h1': { margin: '0', marginBottom: '2', fontSize: 'bodyLarge', lineHeight: 'bodyLarge', fontWeight: 'strong' },
});
const innerClass = css({ maxWidth: 'content', marginInline: 'auto' });

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>('shortcuts');

  return (
    <div className={pageClass} data-testid="settings-page">
      <header className={headerClass}>
        <Button variant="toolbar" data-testid="close-settings" onClick={onClose}>
          <icons.back /> Back to canvas
        </Button>
        <span className={titleClass}>Settings</span>
      </header>
      <div className={bodyClass}>
        <nav className={navClass} aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <NavItem key={s.id} current={section === s.id} data-testid={`nav-${s.id}`} onClick={() => setSection(s.id)}>
              {s.label}
            </NavItem>
          ))}
        </nav>
        <main className={contentClass}>
          <div className={innerClass}>{section === 'shortcuts' ? <ShortcutsSection /> : <GettingStartedSection />}</div>
        </main>
      </div>
    </div>
  );
}
