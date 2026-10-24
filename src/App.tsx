import { css } from 'styled-system/css';
import { DialogProvider } from './design-system';
import { useHashRoute } from './app/useHashRoute';
import { EditorProvider, useEditor } from './editor/EditorContext';
import { Canvas } from './editor/components/Canvas';
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
const bodyClass = css({ flex: '1', display: 'flex', minHeight: '0' });

function Editor({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, dispatch } = useEditor();
  const controls = useViewportControls();
  useKeyboardShortcuts({ state, dispatch, ...controls, openSettings: onOpenSettings });

  return (
    <div className={editorClass}>
      <Toolbar onOpenSettings={onOpenSettings} />
      <div className={bodyClass}>
        <LayersPanel />
        <div className={canvasAreaClass}>
          <Canvas />
          <ToolDock />
        </div>
        <PropertiesPanel />
      </div>
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
