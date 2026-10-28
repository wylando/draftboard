import { defineTextStyles } from '@pandacss/dev';

/** Inspector text is 12px; reading surfaces (Settings, dialogs) use `large` at 13px. Emphasis is 600. */
export const textStyles = defineTextStyles({
  body: {
    medium: {
      value: { fontFamily: 'default', fontSize: 'ui', lineHeight: 'ui', fontWeight: 'default' },
    },
    mediumStrong: {
      value: { fontFamily: 'default', fontSize: 'ui', lineHeight: 'ui', fontWeight: 'heading' },
    },
    large: {
      value: { fontFamily: 'default', fontSize: 'bodyLarge', lineHeight: 'bodyLarge', fontWeight: 'default' },
    },
    largeStrong: {
      value: { fontFamily: 'default', fontSize: 'bodyLarge', lineHeight: 'bodyLarge', fontWeight: 'heading' },
    },
  },
  heading: {
    section: {
      value: { fontFamily: 'default', fontSize: 'bodyLarge', lineHeight: 'bodyLarge', fontWeight: 'heading' },
    },
    page: {
      value: { fontFamily: 'default', fontSize: 'headingPage', lineHeight: 'headingPage', fontWeight: 'heading' },
    },
    title: {
      value: { fontFamily: 'default', fontSize: 'headingTitle', lineHeight: 'headingTitle', fontWeight: 'heading' },
    },
  },
});
