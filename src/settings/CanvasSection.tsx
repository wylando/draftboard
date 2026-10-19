import { RadioGroup } from '@ark-ui/react/radio-group';
import { css, cx } from 'styled-system/css';
import { radioGroup } from 'styled-system/recipes';
import { usePreferences } from './preferences/PreferencesContext';
import { GRID_STYLES, type GridStyle } from './preferences/storage';

const classes = radioGroup();
const headingClass = css({ margin: '0', marginTop: '6' });
const mutedClass = css({ margin: '0', color: 'text.secondary' });

export function CanvasSection() {
  const { preferences, setPreference } = usePreferences();

  return (
    <section data-testid="canvas-section">
      <h1>Canvas</h1>
      <p className={mutedClass}>How the canvas background looks. Saved in this browser.</p>

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
    </section>
  );
}
