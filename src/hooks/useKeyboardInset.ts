import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height of the on-screen keyboard on Android, 0 elsewhere.
 *
 * Android apps now draw edge to edge, so the window no longer shrinks when the
 * keyboard opens and fields near the bottom end up hidden behind it. Adding
 * this as bottom padding lets the form scroll above the keyboard. iOS uses
 * ScrollView's automaticallyAdjustKeyboardInsets instead.
 */
export function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
