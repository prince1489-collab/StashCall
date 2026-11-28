import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Modal, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Ticket } from '../domain/types';
import { space } from './theme';

const MAX_ZOOM = 5;
const DOUBLE_TAP_MS = 280;

/**
 * Full-screen photos: swipe left and right through them, pinch or double-tap
 * to zoom into one (the small print on a boarding pass), drag to look around
 * while zoomed. `light` puts them on white, so a scanner reads a barcode.
 */
export function PhotoViewer({
  photos,
  openId,
  onClose,
  onRemove,
  light = false,
  label = 'Photo',
}: {
  photos: Ticket[];
  /** The photo to open on; nothing shows while unset. */
  openId: string | null;
  onClose: () => void;
  onRemove?: (photo: Ticket) => void;
  light?: boolean;
  label?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const start = Math.max(0, photos.findIndex((p) => p.id === openId));
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    setIndex(start);
    setZoomed(false);
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = photos[Math.min(index, photos.length - 1)];
  const fg = light ? '#000' : '#fff';
  return (
    <Modal visible={!!openId && photos.length > 0} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewer, { backgroundColor: light ? '#fff' : '#000', paddingTop: insets.top }]}>
        {photos.length > 1 ? (
          <Text style={[styles.count, { color: fg }]} accessibilityLiveRegion="polite">
            {index + 1} of {photos.length}
          </Text>
        ) : null}
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          style={styles.list}
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          // Swiping moves to the next photo, except while looking around a zoomed one.
          scrollEnabled={!zoomed}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <ZoomImage uri={item.uri} label={label} onZoom={setZoomed} />
            </View>
          )}
        />
        <View style={[styles.bar, { paddingBottom: space.l + insets.bottom }]}>
          {onRemove && current ? (
            <Text style={[styles.link, { color: '#ff8a80' }]} onPress={() => onRemove(current)} accessibilityRole="button">
              Remove
            </Text>
          ) : (
            <View />
          )}
          <Text style={styles.link} onPress={onClose} accessibilityRole="button">
            Close
          </Text>
        </View>
      </View>
    </Modal>
  );
}

/** One photo that zooms with two fingers or a double tap, and pans while zoomed. */
function ZoomImage({ uri, label, onZoom }: { uri: string; label: string; onZoom: (zoomed: boolean) => void }) {
  // A ref, not state: the gesture handlers are made once and read it later.
  const size = useRef({ w: 1, h: 1 }).current;
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  // Where things stood when the current gesture began.
  const s = useRef({ scale: 1, x: 0, y: 0, pinch: 0, lastTap: 0, nowScale: 1, nowX: 0, nowY: 0, ox: 0, oy: 0, fingers: 0, doubleTap: false }).current;

  const clamp = (x: number, y: number, k: number) => {
    const maxX = ((k - 1) * size.w) / 2;
    const maxY = ((k - 1) * size.h) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const set = (k: number, x: number, y: number) => {
    const c = clamp(x, y, k);
    s.nowScale = k;
    s.nowX = c.x;
    s.nowY = c.y;
    scale.setValue(k);
    tx.setValue(c.x);
    ty.setValue(c.y);
  };
  const settle = (k: number, x: number, y: number) => {
    const c = k <= 1.01 ? { x: 0, y: 0 } : clamp(x, y, k);
    const kk = k <= 1.01 ? 1 : k;
    s.scale = kk;
    s.x = c.x;
    s.y = c.y;
    s.nowScale = kk;
    s.nowX = c.x;
    s.nowY = c.y;
    Animated.parallel([
      Animated.spring(scale, { toValue: kk, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(tx, { toValue: c.x, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(ty, { toValue: c.y, useNativeDriver: true, bounciness: 0 }),
    ]).start();
    onZoom(kk > 1);
  };

  const distance = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
  };

  /** Starts a new stretch of the gesture from where things are now: a finger was added or lifted. */
  const rebase = (e: GestureResponderEvent, g: PanResponderGestureState) => {
    s.scale = s.nowScale;
    s.x = s.nowX;
    s.y = s.nowY;
    s.pinch = distance(e);
    s.ox = g.dx;
    s.oy = g.dy;
    s.fingers = e.nativeEvent.touches.length;
  };

  const responder = useRef(
    PanResponder.create({
      // Only take a touch for a pinch, to pan a zoomed photo, or as the second
      // tap of a double tap. An ordinary drag at 1x is never claimed, so it
      // reaches the list's native scrolling and swipes to the next photo.
      onStartShouldSetPanResponder: (e: GestureResponderEvent) => {
        if (e.nativeEvent.touches.length >= 2 || s.scale > 1) return true;
        const now = Date.now();
        if (now - s.lastTap < DOUBLE_TAP_MS) {
          s.doubleTap = true;
          return true;
        }
        s.lastTap = now;
        return false;
      },
      onMoveShouldSetPanResponder: (e: GestureResponderEvent) => e.nativeEvent.touches.length >= 2 || s.scale > 1,
      onPanResponderTerminationRequest: () => s.scale <= 1,
      onPanResponderGrant: (e: GestureResponderEvent, g: PanResponderGestureState) => {
        if (s.doubleTap) {
          s.doubleTap = false;
          s.lastTap = 0;
          s.fingers = 0;
          settle(s.scale > 1 ? 1 : 2.5, 0, 0);
          return;
        }
        rebase(e, g);
      },
      onPanResponderMove: (e: GestureResponderEvent, g: PanResponderGestureState) => {
        if (s.fingers === 0) return; // The double tap's own touch.
        if (e.nativeEvent.touches.length !== s.fingers) rebase(e, g);
        if (e.nativeEvent.touches.length >= 2) {
          const d = distance(e);
          const k = Math.max(1, Math.min(MAX_ZOOM, (s.scale * d) / (s.pinch || d)));
          set(k, s.x, s.y);
        } else if (s.scale > 1) {
          set(s.scale, s.x + g.dx - s.ox, s.y + g.dy - s.oy);
        }
      },
      onPanResponderRelease: () => settle(s.nowScale, s.nowX, s.nowY),
      onPanResponderTerminate: () => settle(s.nowScale, s.nowX, s.nowY),
    }),
  ).current;

  return (
    <View
      style={styles.page}
      onLayout={(e) => {
        size.w = e.nativeEvent.layout.width;
        size.h = e.nativeEvent.layout.height;
      }}
      {...responder.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        resizeMode="contain"
        accessibilityLabel={label}
        accessibilityHint="Pinch or double-tap to zoom"
        style={[styles.image, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1 },
  count: { textAlign: 'center', fontSize: 14, fontWeight: '600', paddingVertical: space.s },
  list: { flex: 1 },
  page: { flex: 1, overflow: 'hidden' },
  image: { flex: 1, width: '100%' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.l, backgroundColor: '#000' },
  link: { color: '#fff', fontSize: 17, fontWeight: '600', padding: space.s },
});
