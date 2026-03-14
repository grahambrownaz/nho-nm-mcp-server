import { PostcardState, POSTCARD_SIZES } from './postcard-constants';
import { getPreset } from './postcard-presets';

export function generateFrontHtml(state: PostcardState): string {
  const preset = getPreset(state.preset);
  return preset.generateFrontHtml(state);
}

export function generateBackHtml(state: PostcardState): string {
  const preset = getPreset(state.preset);
  return preset.generateBackHtml(state);
}

export function generateCssStyles(state: PostcardState): string {
  const fonts = [state.headlineFont, state.bodyFont].filter(
    (f, i, arr) => arr.indexOf(f) === i
  );
  const fontImport = fonts
    .map((f) => `family=${f.replace(/\s+/g, '+')}:wght@400;700`)
    .join('&');
  return `@import url('https://fonts.googleapis.com/css2?${fontImport}&display=swap');`;
}

export function generatePreviewDocument(
  state: PostcardState,
  side: 'front' | 'back'
): string {
  const size = POSTCARD_SIZES[state.size];
  const html = side === 'front' ? generateFrontHtml(state) : generateBackHtml(state);
  const fonts = [state.headlineFont, state.bodyFont].filter(
    (f, i, arr) => arr.indexOf(f) === i
  );
  const fontParam = fonts
    .map((f) => `family=${f.replace(/\s+/g, '+')}:wght@400;700`)
    .join('&');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?${fontParam}&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${size.widthIn}in; height: ${size.heightIn}in; overflow: hidden; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

export function generateTemplatePayload(state: PostcardState) {
  return {
    name: state.name,
    description: state.description || undefined,
    category: state.category,
    size: state.size,
    html_front: generateFrontHtml(state),
    html_back: generateBackHtml(state),
    css_styles: generateCssStyles(state),
    is_public: state.isPublic,
  };
}
