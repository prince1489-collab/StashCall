import type { ItemMoment } from './types';

export interface PresetItem {
  id: string;
  name: string;
  moment: ItemMoment;
}

/**
 * High-regret items offered on first run so a new user gets value
 * without typing or taking photos.
 */
export const PRESET_ITEMS: PresetItem[] = [
  { id: 'passport', name: 'Passports', moment: 'home' },
  { id: 'glasses', name: 'Glasses', moment: 'both' },
  { id: 'lenses', name: 'Contact lenses, case and solution', moment: 'both' },
  { id: 'medication', name: 'Medication', moment: 'both' },
  { id: 'phone-charger', name: 'Phone charger', moment: 'both' },
  { id: 'laptop-charger', name: 'Laptop charger', moment: 'both' },
  { id: 'adaptor', name: 'Plug adaptor', moment: 'both' },
  { id: 'comfort-toy', name: "Child's comfort toy", moment: 'both' },
  { id: 'wallet', name: 'Wallet and cards', moment: 'home' },
  { id: 'house-keys', name: 'House keys', moment: 'home' },
];
