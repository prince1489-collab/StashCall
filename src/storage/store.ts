import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InsuranceCover, Item, LocalDate, Owner, Ticket, Trip } from '../domain/types';

/**
 * Everything StashCall knows, kept on the device only.
 * Bump `version` and add a migration when the shape changes.
 */
export interface AppData {
  version: 1;
  owners: Owner[];
  items: Item[];
  trips: Trip[];
  /** How the household is insured for travel; unset until asked. */
  insurance?: InsuranceCover;
  /** When the annual or bank policy ends, if known. */
  insuranceEnds?: LocalDate;
  /** Photos of the annual or bank policy, shown on every trip. */
  insuranceDocs?: Ticket[];
  /** Which person uses this phone, once the household has people. */
  meId?: string;
  /** The household passport that runs out first, if known. Used until people have their own dates. */
  passportExpires?: LocalDate;
}

const KEY = 'stashcall:data';

export const EMPTY_DATA: AppData = { version: 1, owners: [], items: [], trips: [] };

export async function loadData(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return EMPTY_DATA;
  try {
    const parsed = JSON.parse(raw) as AppData;
    return { ...EMPTY_DATA, ...parsed };
  } catch {
    // Corrupt data should never brick the app; start fresh.
    return EMPTY_DATA;
  }
}

export async function saveData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

/** "Delete all my data". Photos are removed separately by the caller. */
export async function clearData(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
