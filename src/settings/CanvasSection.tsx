import { RadioGroup } from '@ark-ui/react/radio-group';
import { Switch } from '@ark-ui/react/switch';
import { Button, ColorInput } from '../design-system';
import { css, cx } from 'styled-system/css';
import { radioGroup, toggleSwitch } from 'styled-system/recipes';
import { usePreferences } from './preferences/PreferencesContext';
import { DEFAULT_PREFERENCES, GRID_STYLES, type GridStyle } from './preferences/storage';
import { SQL_DIALECT_IDS, SQL_DIALECTS, type SqlDialect } from '../editor/model/table';

const classes = radioGroup();
const switchClasses = toggleSwitch();
const headingClass = css({ margin: '0', marginTop: '6' });
const sectionHeadingClass = css({ margin: '0', marginTop: '6', textStyle: 'body.largeStrong' });
const mutedClass = css({ margin: '0', color: 'text.secondary' });
const colorRowClass = css({ display: 'flex', alignItems: 'center', gap: '2', marginTop: '2', maxWidth: 'sidebarWidth' });

export function CanvasSection() {
  const { preferences, setPreference } = usePreferences();

  return (
    <section data-testid="canvas-section">
      <h1>Canvas</h1>
      <p className={mutedClass}>How the canvas looks and behaves. Saved in this browser.</p>

      <RadioGroup.Root
        className={classes.root}
        value={preferences.gridStyle}
        onValueChange={({ value }) => value && setPreference('gridStyle', value as GridStyle)}
      >
        <RadioGroup.Label className={cx(classes.label, headingClass)} asChild>
          <h2>Grid style</h2>
        </RadioGroup.Label>
        {GRID_STYLES.map((g) => (
          <RadioGroup.Item key={g.id} value={g.id} className={classes.item} data-testid={`grid-style-${g.id}`}>
            <RadioGroup.ItemControl className={classes.itemControl} />
            <RadioGroup.ItemText className={classes.itemText}>{g.label}</RadioGroup.ItemText>
            <span className={classes.itemDescription}>{g.description}</span>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      <h2 className={sectionHeadingClass}>Snapping</h2>
      <Switch.Root
        className={switchClasses.root}
        checked={preferences.snapToLayers}
        onCheckedChange={({ checked }) => setPreference('snapToLayers', checked)}
        data-testid="snap-to-layers"
      >
        <Switch.Control className={switchClasses.control}>
          <Switch.Thumb className={switchClasses.thumb} />
        </Switch.Control>
        <Switch.Label className={switchClasses.label}>Snap to layers</Switch.Label>
        <Switch.HiddenInput aria-describedby="snap-to-layers-description" />
      </Switch.Root>
      <p id="snap-to-layers-description" className={switchClasses.description}>
        Moving, resizing and drawing line up with other layers’ edges and centers. Hold ⌘/Ctrl once a drag has started to
        skip it for that drag.
      </p>

      <RadioGroup.Root
        className={classes.root}
        value={preferences.sqlDialect}
        onValueChange={({ value }) => value && setPreference('sqlDialect', value as SqlDialect)}
      >
        <RadioGroup.Label className={cx(classes.label, headingClass)} asChild>
          <h2>SQL dialect</h2>
        </RadioGroup.Label>
        <p className={mutedClass}>Suggests column types for tables and types a new table’s id. Types stay free text.</p>
        {SQL_DIALECT_IDS.map((id) => (
          <RadioGroup.Item key={id} value={id} className={classes.item} data-testid={`sql-dialect-${id}`}>
            <RadioGroup.ItemControl className={classes.itemControl} />
            <RadioGroup.ItemText className={classes.itemText}>{SQL_DIALECTS[id].label}</RadioGroup.ItemText>
            <span className={classes.itemDescription}>New ids are {SQL_DIALECTS[id].idType}.</span>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      <h2 className={sectionHeadingClass}>Relationship highlight</h2>
      <p className={mutedClass}>Outlines the connectors on the selected tables and the tables they link to.</p>
      <div className={colorRowClass}>
        <ColorInput
          value={preferences.relationHighlight}
          onCommit={(v) => setPreference('relationHighlight', v)}
          testId="relation-highlight"
          label="Relationship highlight color"
        />
        {/* Never disabled: disabling it on click would drop keyboard focus to the page. */}
        <Button
          variant="ghost"
          data-testid="relation-highlight-reset"
          aria-label="Reset relationship highlight color"
          onClick={() => setPreference('relationHighlight', DEFAULT_PREFERENCES.relationHighlight)}
        >
          Reset
        </Button>
      </div>
    </section>
  );
}
