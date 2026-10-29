import { css } from 'styled-system/css';
import { DialogProvider } from './design-system';
import { useHashRoute } from './app/useHashRoute';
import { EditorProvider, useBoards, useEditor } from './editor/EditorContext';
import { HoverProvider } from './editor/HoverContext';
import { FileActionsProvider, useFileActions } from './editor/hooks/FileActions';
import { SectionFoldsProvider } from './editor/SectionFoldsContext';
import { Canvas } from './editor/components/Canvas';
import { EditorBody } from './editor/components/EditorBody';
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

function Editor({ onOpenSettings }: { onOpenSettings: (section?: string) => void }) {
  const { state, dispatch } = useEditor();
  const { activeId } = useBoards();
  const controls = useViewportControls();
  const files = useFileActions();
  useKeyboardShortcuts({ state, dispatch, ...controls, openSettings: onOpenSettings, files });
  return (
    <div className={editorClass}>
      <Toolbar onOpenSettings={onOpenSettings} />
      <SectionFoldsProvider>
        <HoverProvider>
        <EditorBody
          onOpenGuide={() => onOpenSettings('getting-started')}
          layers={<LayersPanel key={`layers-${activeId}`} />}
          canvas={
            <div className={canvasAreaClass}>
              {/* Keyed so marquee, guides, hover and in-place editors start fresh on each board. */}
              <Canvas key={activeId} />
              <ToolDock />
            </div>
          }
          properties={<PropertiesPanel key={`properties-${activeId}`} />}
        />
        </HoverProvider>
      </SectionFoldsProvider>
    </div>
  );
}

export function App() {
  const { route, section, navigate } = useHashRoute();
  // Providers sit above the route so the document, undo history and bindings
  // survive switching between the canvas and Settings.
  return (
    <KeybindingsProvider>
      <PreferencesProvider>
        <EditorProvider>
          <DialogProvider>
            {route === 'settings' ? (
              <SettingsPage key={section ?? ''} section={section} onClose={() => navigate('editor')} />
            ) : (
              <FileActionsProvider>
                <Editor onOpenSettings={(target) => navigate('settings', target)} />
              </FileActionsProvider>
            )}
          </DialogProvider>
        </EditorProvider>
      </PreferencesProvider>
    </KeybindingsProvider>
  );
}
