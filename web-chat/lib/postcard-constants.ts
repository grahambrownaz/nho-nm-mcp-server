export const POSTCARD_SIZES = {
  '4x6': { widthIn: 6, heightIn: 4, widthPx: 432, heightPx: 288, label: '4" x 6"' },
  '6x9': { widthIn: 9, heightIn: 6, widthPx: 648, heightPx: 432, label: '6" x 9"' },
  '6x11': { widthIn: 11, heightIn: 6, widthPx: 792, heightPx: 432, label: '6" x 11"' },
} as const;

export type PostcardSize = keyof typeof POSTCARD_SIZES;

export const MERGE_FIELDS = [
  { name: 'first_name', label: 'First Name' },
  { name: 'last_name', label: 'Last Name' },
  { name: 'address', label: 'Address' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'zip', label: 'ZIP' },
] as const;

export const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter', category: 'sans-serif' },
  { value: 'Roboto', label: 'Roboto', category: 'sans-serif' },
  { value: 'Open Sans', label: 'Open Sans', category: 'sans-serif' },
  { value: 'Lato', label: 'Lato', category: 'sans-serif' },
  { value: 'Montserrat', label: 'Montserrat', category: 'sans-serif' },
  { value: 'Oswald', label: 'Oswald', category: 'sans-serif' },
  { value: 'Playfair Display', label: 'Playfair Display', category: 'serif' },
  { value: 'Merriweather', label: 'Merriweather', category: 'serif' },
  { value: 'Georgia', label: 'Georgia', category: 'serif' },
  { value: 'Arial', label: 'Arial', category: 'sans-serif' },
] as const;

export const CATEGORY_OPTIONS = [
  { value: 'realtor', label: 'Realtor' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'home_services', label: 'Home Services' },
  { value: 'retail', label: 'Retail' },
  { value: 'general', label: 'General' },
  { value: 'custom', label: 'Custom' },
] as const;

export type CategoryValue = (typeof CATEGORY_OPTIONS)[number]['value'];

export const DEFAULT_COLORS = {
  backgroundColor: '#1a365d',
  textColor: '#ffffff',
  accentColor: '#f59e0b',
  ctaBackgroundColor: '#f59e0b',
  ctaTextColor: '#1a365d',
};

export interface PostcardFrontState {
  headline: string;
  subheadline: string;
  bodyText: string;
  ctaText: string;
  logoDataUrl: string | null;
  imageDataUrl: string | null;
}

export interface PostcardBackState {
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  companyWebsite: string;
  bodyText: string;
  includeRecipientBlock: boolean;
}

export interface PostcardState {
  name: string;
  description: string;
  category: CategoryValue;
  size: PostcardSize;
  isPublic: boolean;
  activeSide: 'front' | 'back';
  preset: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  ctaBackgroundColor: string;
  ctaTextColor: string;
  headlineFont: string;
  bodyFont: string;
  front: PostcardFrontState;
  back: PostcardBackState;
  isSaving: boolean;
  saveError: string | null;
  savedTemplateId: string | null;
}

export const INITIAL_STATE: PostcardState = {
  name: '',
  description: '',
  category: 'custom',
  size: '4x6',
  isPublic: false,
  activeSide: 'front',
  preset: 'full-bleed',
  ...DEFAULT_COLORS,
  headlineFont: 'Montserrat',
  bodyFont: 'Open Sans',
  front: {
    headline: 'Welcome to Your New Home!',
    subheadline: 'We\'d love to help you settle in',
    bodyText: 'As a new homeowner, you deserve the best service in the neighborhood.',
    ctaText: 'Call Today for a Free Quote!',
    logoDataUrl: null,
    imageDataUrl: null,
  },
  back: {
    companyName: 'Your Company Name',
    companyPhone: '(555) 123-4567',
    companyAddress: '123 Main St, Anytown, ST 12345',
    companyWebsite: 'www.yourcompany.com',
    bodyText: '',
    includeRecipientBlock: true,
  },
  isSaving: false,
  saveError: null,
  savedTemplateId: null,
};
