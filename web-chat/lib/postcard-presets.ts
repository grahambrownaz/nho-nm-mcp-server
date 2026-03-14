import { PostcardState, POSTCARD_SIZES } from './postcard-constants';

export interface PostcardPreset {
  id: string;
  name: string;
  description: string;
  generateFrontHtml: (state: PostcardState) => string;
  generateBackHtml: (state: PostcardState) => string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateStandardBack(state: PostcardState): string {
  const size = POSTCARD_SIZES[state.size];
  const recipientBlock = state.back.includeRecipientBlock
    ? `<div style="position:absolute;bottom:30px;right:30px;text-align:left;font-size:12px;color:#111827;line-height:1.6;">
        <div>{{first_name}} {{last_name}}</div>
        <div>{{address}}</div>
        <div>{{city}}, {{state}} {{zip}}</div>
      </div>`
    : '';

  return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;background:#ffffff;font-family:'${state.bodyFont}',sans-serif;position:relative;padding:25px 30px;">
  <div style="margin-bottom:15px;">
    <div style="font-size:14px;font-weight:bold;color:#1a1a1a;">${escapeHtml(state.back.companyName)}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px;">${escapeHtml(state.back.companyAddress)}</div>
    <div style="font-size:11px;color:#6b7280;">${escapeHtml(state.back.companyPhone)}</div>
    ${state.back.companyWebsite ? `<div style="font-size:11px;color:#6b7280;">${escapeHtml(state.back.companyWebsite)}</div>` : ''}
  </div>
  ${state.back.bodyText ? `<div style="font-size:12px;color:#374151;line-height:1.6;max-width:50%;">${escapeHtml(state.back.bodyText)}</div>` : ''}
  <div style="position:absolute;top:25px;right:30px;width:80px;height:60px;border:1px solid #d1d5db;display:flex;align-items:center;justify-content:center;">
    <span style="font-size:9px;color:#9ca3af;text-align:center;">POSTAGE<br>REQUIRED</span>
  </div>
  ${recipientBlock}
</div>`;
}

export const PRESETS: PostcardPreset[] = [
  {
    id: 'full-bleed',
    name: 'Full Bleed',
    description: 'Bold background with centered content',
    generateFrontHtml: (state) => {
      const size = POSTCARD_SIZES[state.size];
      const logoHtml = state.front.logoDataUrl
        ? `<img src="${state.front.logoDataUrl}" alt="Logo" style="max-height:50px;max-width:160px;margin-bottom:16px;" />`
        : '';
      return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;background:${state.backgroundColor};display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;text-align:center;font-family:'${state.bodyFont}',sans-serif;">
  ${logoHtml}
  <div style="font-family:'${state.headlineFont}',sans-serif;color:${state.textColor};font-size:28px;font-weight:bold;line-height:1.2;margin-bottom:6px;">${escapeHtml(state.front.headline)}</div>
  <div style="color:${state.textColor};font-size:15px;margin-bottom:12px;opacity:0.85;">${escapeHtml(state.front.subheadline)}</div>
  <div style="width:40px;height:3px;background:${state.accentColor};margin-bottom:14px;"></div>
  <div style="color:${state.textColor};font-size:13px;line-height:1.5;max-width:75%;margin-bottom:20px;opacity:0.9;">${escapeHtml(state.front.bodyText)}</div>
  <div style="background:${state.ctaBackgroundColor};color:${state.ctaTextColor};padding:10px 28px;border-radius:4px;font-weight:bold;font-size:14px;">${escapeHtml(state.front.ctaText)}</div>
</div>`;
    },
    generateBackHtml: generateStandardBack,
  },
  {
    id: 'split-left',
    name: 'Split Left',
    description: 'Image left, text right',
    generateFrontHtml: (state) => {
      const size = POSTCARD_SIZES[state.size];
      const imageArea = state.front.imageDataUrl
        ? `<img src="${state.front.imageDataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div style="width:100%;height:100%;background:${state.accentColor};opacity:0.3;"></div>`;
      const logoHtml = state.front.logoDataUrl
        ? `<img src="${state.front.logoDataUrl}" alt="Logo" style="max-height:36px;max-width:140px;margin-bottom:12px;" />`
        : '';
      return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;display:flex;font-family:'${state.bodyFont}',sans-serif;">
  <div style="width:42%;background:${state.accentColor};overflow:hidden;position:relative;">
    ${imageArea}
  </div>
  <div style="width:58%;padding:28px 30px;display:flex;flex-direction:column;justify-content:center;background:${state.backgroundColor};">
    ${logoHtml}
    <div style="font-family:'${state.headlineFont}',sans-serif;color:${state.textColor};font-size:24px;font-weight:bold;line-height:1.2;margin-bottom:6px;">${escapeHtml(state.front.headline)}</div>
    <div style="color:${state.textColor};font-size:13px;margin-bottom:10px;opacity:0.85;">${escapeHtml(state.front.subheadline)}</div>
    <div style="color:${state.textColor};font-size:12px;line-height:1.5;margin-bottom:16px;opacity:0.9;">${escapeHtml(state.front.bodyText)}</div>
    <div style="background:${state.ctaBackgroundColor};color:${state.ctaTextColor};padding:8px 22px;border-radius:4px;font-weight:bold;font-size:13px;display:inline-block;text-align:center;">${escapeHtml(state.front.ctaText)}</div>
  </div>
</div>`;
    },
    generateBackHtml: generateStandardBack,
  },
  {
    id: 'photo-header',
    name: 'Photo Header',
    description: 'Hero image on top, content below',
    generateFrontHtml: (state) => {
      const size = POSTCARD_SIZES[state.size];
      const imageArea = state.front.imageDataUrl
        ? `<img src="${state.front.imageDataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div style="width:100%;height:100%;background:linear-gradient(135deg,${state.accentColor},${state.backgroundColor});"></div>`;
      const logoHtml = state.front.logoDataUrl
        ? `<img src="${state.front.logoDataUrl}" alt="Logo" style="max-height:30px;max-width:120px;position:absolute;top:10px;left:15px;" />`
        : '';
      return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;display:flex;flex-direction:column;font-family:'${state.bodyFont}',sans-serif;position:relative;">
  ${logoHtml}
  <div style="height:45%;overflow:hidden;position:relative;">
    ${imageArea}
  </div>
  <div style="height:55%;background:${state.backgroundColor};padding:18px 28px;display:flex;flex-direction:column;justify-content:center;">
    <div style="font-family:'${state.headlineFont}',sans-serif;color:${state.textColor};font-size:22px;font-weight:bold;line-height:1.2;margin-bottom:6px;">${escapeHtml(state.front.headline)}</div>
    <div style="color:${state.textColor};font-size:12px;line-height:1.5;margin-bottom:14px;opacity:0.9;">${escapeHtml(state.front.bodyText)}</div>
    <div style="background:${state.ctaBackgroundColor};color:${state.ctaTextColor};padding:8px 22px;border-radius:4px;font-weight:bold;font-size:13px;display:inline-block;text-align:center;">${escapeHtml(state.front.ctaText)}</div>
  </div>
</div>`;
    },
    generateBackHtml: generateStandardBack,
  },
  {
    id: 'centered-card',
    name: 'Centered Card',
    description: 'White card on colored background',
    generateFrontHtml: (state) => {
      const size = POSTCARD_SIZES[state.size];
      const logoHtml = state.front.logoDataUrl
        ? `<img src="${state.front.logoDataUrl}" alt="Logo" style="max-height:40px;max-width:140px;margin-bottom:14px;" />`
        : '';
      return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;background:${state.accentColor};display:flex;align-items:center;justify-content:center;padding:20px;font-family:'${state.bodyFont}',sans-serif;">
  <div style="background:#ffffff;border-radius:8px;padding:30px 35px;text-align:center;max-width:85%;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    ${logoHtml}
    <div style="font-family:'${state.headlineFont}',sans-serif;color:${state.backgroundColor};font-size:24px;font-weight:bold;line-height:1.2;margin-bottom:6px;">${escapeHtml(state.front.headline)}</div>
    <div style="color:#6b7280;font-size:13px;margin-bottom:10px;">${escapeHtml(state.front.subheadline)}</div>
    <div style="color:#374151;font-size:12px;line-height:1.5;margin-bottom:18px;">${escapeHtml(state.front.bodyText)}</div>
    <div style="background:${state.ctaBackgroundColor};color:${state.ctaTextColor};padding:10px 28px;border-radius:4px;font-weight:bold;font-size:14px;display:inline-block;">${escapeHtml(state.front.ctaText)}</div>
  </div>
</div>`;
    },
    generateBackHtml: generateStandardBack,
  },
  {
    id: 'bold-stripe',
    name: 'Bold Stripe',
    description: 'Accent stripe with large headline',
    generateFrontHtml: (state) => {
      const size = POSTCARD_SIZES[state.size];
      const logoHtml = state.front.logoDataUrl
        ? `<img src="${state.front.logoDataUrl}" alt="Logo" style="max-height:36px;max-width:130px;position:absolute;top:15px;right:20px;" />`
        : '';
      return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;background:${state.backgroundColor};position:relative;font-family:'${state.bodyFont}',sans-serif;overflow:hidden;">
  ${logoHtml}
  <div style="position:absolute;left:0;top:0;width:35%;height:100%;background:${state.accentColor};"></div>
  <div style="position:relative;padding:30px 35px 30px 40%;display:flex;flex-direction:column;justify-content:center;height:100%;">
    <div style="font-family:'${state.headlineFont}',sans-serif;color:${state.textColor};font-size:28px;font-weight:bold;line-height:1.15;margin-bottom:8px;">${escapeHtml(state.front.headline)}</div>
    <div style="color:${state.textColor};font-size:13px;line-height:1.5;margin-bottom:16px;opacity:0.9;">${escapeHtml(state.front.bodyText)}</div>
    <div style="background:${state.ctaBackgroundColor};color:${state.ctaTextColor};padding:8px 22px;border-radius:4px;font-weight:bold;font-size:13px;display:inline-block;text-align:center;">${escapeHtml(state.front.ctaText)}</div>
  </div>
</div>`;
    },
    generateBackHtml: generateStandardBack,
  },
  {
    id: 'minimal-clean',
    name: 'Minimal Clean',
    description: 'White background, clean typography',
    generateFrontHtml: (state) => {
      const size = POSTCARD_SIZES[state.size];
      const logoHtml = state.front.logoDataUrl
        ? `<img src="${state.front.logoDataUrl}" alt="Logo" style="max-height:36px;max-width:140px;margin-bottom:20px;" />`
        : '';
      return `<div style="width:${size.widthIn}in;height:${size.heightIn}in;background:#ffffff;padding:35px 40px;display:flex;flex-direction:column;justify-content:center;font-family:'${state.bodyFont}',sans-serif;">
  ${logoHtml}
  <div style="font-family:'${state.headlineFont}',sans-serif;color:${state.backgroundColor};font-size:26px;font-weight:bold;line-height:1.2;margin-bottom:6px;">${escapeHtml(state.front.headline)}</div>
  <div style="color:#6b7280;font-size:14px;margin-bottom:12px;">${escapeHtml(state.front.subheadline)}</div>
  <div style="width:40px;height:3px;background:${state.accentColor};margin-bottom:14px;"></div>
  <div style="color:#374151;font-size:13px;line-height:1.6;max-width:70%;margin-bottom:20px;">${escapeHtml(state.front.bodyText)}</div>
  <div style="background:${state.backgroundColor};color:#ffffff;padding:10px 28px;border-radius:4px;font-weight:bold;font-size:14px;display:inline-block;">${escapeHtml(state.front.ctaText)}</div>
</div>`;
    },
    generateBackHtml: generateStandardBack,
  },
];

export function getPreset(id: string): PostcardPreset {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}
