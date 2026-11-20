import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/**
 * Item photos are copied into the app's own documents folder so they
 * survive cache clean-ups. They never leave the phone.
 */
function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'item-photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function ticketDir(): Directory {
  const dir = new Directory(Paths.document, 'tickets');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function keep(uri: string, dir: Directory = photoDir()): string {
  const src = uri.includes('://') ? uri : `file://${uri}`;
  const last = src.split('/').pop() ?? '';
  const ext = (last.includes('.') ? last.split('.').pop()?.split('?')[0] : '') || 'jpg';
  const dest = new File(dir, `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`);
  new File(src).copy(dest);
  return dest.uri;
}

/** Copies a shared or picked ticket image into the app. */
export function keepTicket(uri: string): string {
  return keep(uri, ticketDir());
}

/** Picks a ticket screenshot from the gallery, full size. Null if cancelled. */
export async function pickTicket(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (result.canceled || !result.assets[0]) return null;
  return keepTicket(result.assets[0].uri);
}

/** Returns a kept photo URI, or null if the user cancelled or said no. */
export async function takeItemPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  return keep(result.assets[0].uri);
}

export function deletePhoto(uri?: string): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // A missing photo is not worth bothering the user about.
  }
}

/** Removes every kept photo, for "delete all my data". */
export function deleteAllPhotos(): void {
  for (const name of ['item-photos', 'tickets']) {
    const dir = new Directory(Paths.document, name);
    if (dir.exists) dir.delete();
  }
}
