import { defineTextStyles } from '@pandacss/dev';

export const textStyles = defineTextStyles({
  body: {
    small: {
      value: { fontFamily: 'default', fontSize: 'bodySmall', lineHeight: 'bodySmall', fontWeight: 'default' },
    },
    medium: {
      value: { fontFamily: 'default', fontSize: 'bodyMedium', lineHeight: 'bodyMedium', fontWeight: 'default' },
    },
    mediumStrong: {
      value: { fontFamily: 'default', fontSize: 'bodyMedium', lineHeight: 'bodyMedium', fontWeight: 'strong' },
    },
    large: {
      value: { fontFamily: 'default', fontSize: 'bodyLarge', lineHeight: 'bodyLarge', fontWeight: 'default' },
    },
    largeStrong: {
      value: { fontFamily: 'default', fontSize: 'bodyLarge', lineHeight: 'bodyLarge', fontWeight: 'strong' },
    },
  },
});
