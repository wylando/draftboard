import { css, cx } from 'styled-system/css';
import { usePreferences } from './preferences/PreferencesContext';
import { GRID_STYLES } from './preferences/storage';

const headingClass = css({ margin: '0', marginTop: '6', marginBottom: '2', textStyle: 'body.largeStrong' });
const mutedClass = css({ margin: '0', color: 'text.secondary' });
const fieldsetClass = css({ margin: '0', padding: '0', border: 'none', display: 'grid', gap: '2' });
const optionClass = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: '2',
  alignItems: 'baseline',
  paddingBlock: '2',
  paddingInline: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border',
  borderRadius: 'medium',
  cursor: 'pointer',
  _hover: { bg: 'bg.hover' },
});
const optionCheckedClass = css({ borderColor: 'border.selected', bg: 'bg.selected', _hover: { bg: 'bg.selected' } });
const radioClass = css({ margin: '0', accentColor: 'bg.brand' });
const labelClass = css({ textStyle: 'body.largeStrong' });
const descClass = css({ gridColumn: '2', color: 'text.secondary' });

export function CanvasSection() {
  const { preferences, setPreference } = usePreferences();

  return (
    <section data-testid="canvas-section">
      <h1>Canvas</h1>
      <p className={mutedClass}>How the canvas background looks. Saved in this browser.</p>

      <h2 className={headingClass} id="grid-style-heading">
        Grid style
      </h2>
      <fieldset className={fieldsetClass} aria-labelledby="grid-style-heading">
        {GRID_STYLES.map((g) => {
          const checked = preferences.gridStyle === g.id;
          return (
            <label key={g.id} className={cx(optionClass, checked && optionCheckedClass)} data-testid={`grid-style-${g.id}`}>
              <input
                type="radio"
                name="grid-style"
                value={g.id}
                checked={checked}
                className={radioClass}
                onChange={() => setPreference('gridStyle', g.id)}
              />
              <span className={labelClass}>{g.label}</span>
              <span className={descClass}>{g.description}</span>
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
