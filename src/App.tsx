import { useMemo } from 'react';
import { css } from 'styled-system/css';
import { DialogProvider } from './design-system';
import { useHashRoute } from './app/useHashRoute';
import { EditorProvider, useBoards, useEditor } from './editor/EditorContext';
import { Canvas } from './editor/components/Canvas';
import { EditorBody, useSidePanels } from './editor/components/EditorBody';
import { LayersPanel } from './editor/components/LayersPanel';
import { PropertiesPanel } from './editor/components/PropertiesPanel';
import { ToolDock } from './editor/components/ToolDock';
import { Toolbar } from './editor/components/Toolbar';
import { useKeyboardShortcuts } from './editor/hooks/useKeyboardShortcuts';
import { useViewportControls } from './editor/hooks/useViewportControls';
import { KeybindingsProvider } from './settings/keybindings/KeybindingsContext';
import { PreferencesProvider } from './settings/preferences/PreferencesContext';
import { SettingsPage } from './settings/SettingsPage';

const editorClass = css({ display: 'flex', flexDirection: 'column', height: 'full' });
// The dock overlays this wrapper rather than the canvas element, which handles pointer-down itself.
const canvasAreaClass = css({ position: 'relative', flex: '1', minWidth: '0', display: 'flex' });

function Editor({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, dispatch } = useEditor();
  const { activeId } = useBoards();
  const controls = useViewportControls();
  const panels = useSidePanels();
  useKeyboardShortcuts({ state, dispatch, ...controls, openSettings: onOpenSettings });
  // The splitter re-renders Editor on every handle hover and drag tick; the same elements let
  // React skip the panels and the canvas. They read everything from context, so they must stay prop-less.
  const layers = useMemo(() => <LayersPanel key={`layers-${activeId}`} />, [activeId]);
  const canvas = useMemo(
    () => (
      <div className={canvasAreaClass}>
        {/* Keyed so marquee, guides, hover and in-place editors start fresh on each board. */}
        <Canvas key={activeId} />
        <ToolDock />
      </div>
    ),
    [activeId],
  );
  const properties = useMemo(() => <PropertiesPanel key={`properties-${activeId}`} />, [activeId]);

  return (
    <div className={editorClass}>
      <Toolbar onOpenSettings={onOpenSettings} panels={panels} />
      <EditorBody
        panels={panels}
        layers={layers}
        canvas={canvas}
        properties={properties}
      />
    </div>
  );
}

export function App() {
  const { route, navigate } = useHashRoute();
  // Providers sit above the route so the document, undo history and bindings
  // survive switching between the canvas and Settings.
  return (
    <KeybindingsProvider>
      <PreferencesProvider>
        <EditorProvider>
          <DialogProvider>
            {route === 'settings' ? (
              <SettingsPage onClose={() => navigate('editor')} />
            ) : (
              <Editor onOpenSettings={() => navigate('settings')} />
            )}
          </DialogProvider>
        </EditorProvider>
      </PreferencesProvider>
    </KeybindingsProvider>
  );
}
