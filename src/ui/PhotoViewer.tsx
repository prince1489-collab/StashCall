import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Ticket } from '../domain/types';
import { space } from './theme';

const MAX_ZOOM = 8;
/** What the Zoom button steps through, then back to 1. */
const STEPS = [2.5, 5];
const DOUBLE_TAP_MS = 350;
/** Further than this, a touch is a drag, not a tap. */
const TAP_SLOP = 12;

/**
 * Full-screen photos: swipe left and right through them, pinch or
 * double-tap to zoom into one (the small print on a boarding pass), drag
 * to look around while zoomed. `light` puts them on white, so a scanner
 * reads a barcode.
 *
 * Every touch is handled here in JS, paging included: a native scrolling
 * pager on Android takes a two-finger move for a swipe before a pinch can
 * claim it.
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
  const [height, setHeight] = useState(0);
  const start = Math.max(0, photos.findIndex((p) => p.id === openId));
  const [index, setIndex] = useState(start);
  const [level, setLevel] = useState(1);

  const pageX = useRef(new Animated.Value(-start * width)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // Read by the touch handlers, which are made once.
  const live = useRef({ index: start, count: photos.length, w: width, h: 1, left: 0, top: 0 }).current;
  const stage = useRef<{ measure: (cb: (x: number, y: number, w: number, h: number, left: number, top: number) => void) => void } | null>(null);
  live.count = photos.length;
  live.w = width;
  live.h = height || 1;
  // The zoom as it is now, and as it was when the current stretch of the gesture began.
  const z = useRef({ k: 1, x: 0, y: 0, k0: 1, x0: 0, y0: 0, d0: 0, fx0: 0, fy0: 0, ox: 0, oy: 0, fingers: 0, mode: 'none' as Mode, moved: false, lastTap: 0, startAt: 0 }).current;

  const resetZoom = () => {
    z.k = 1;
    z.x = 0;
    z.y = 0;
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
    setLevel(1);
  };

  const goTo = (i: number, animate = true) => {
    const next = Math.max(0, Math.min(live.count - 1, i));
    if (next !== live.index) resetZoom();
    live.index = next;
    setIndex(next);
    if (animate) Animated.spring(pageX, { toValue: -next * live.w, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    else pageX.setValue(-next * live.w);
  };

  useEffect(() => {
    if (!openId) return;
    resetZoom();
    goTo(start, false);
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the page in place if the phone turns.
  useEffect(() => {
    pageX.setValue(-live.index * width);
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (x: number, y: number, k: number) => {
    const maxX = ((k - 1) * live.w) / 2;
    const maxY = ((k - 1) * live.h) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const show = (k: number, x: number, y: number) => {
    const c = clamp(x, y, k);
    z.k = k;
    z.x = c.x;
    z.y = c.y;
    scale.setValue(k);
    tx.setValue(c.x);
    ty.setValue(c.y);
  };
  /** Springs to a zoom, snapping back to the whole photo below about 1x. */
  const settle = (k: number, x: number, y: number) => {
    const kk = k <= 1.02 ? 1 : Math.min(MAX_ZOOM, k);
    const c = kk === 1 ? { x: 0, y: 0 } : clamp(x, y, kk);
    z.k = kk;
    z.x = c.x;
    z.y = c.y;
    Animated.parallel([
      Animated.spring(scale, { toValue: kk, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(tx, { toValue: c.x, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(ty, { toValue: c.y, useNativeDriver: true, bounciness: 0 }),
    ]).start();
    setLevel(kk);
  };
  /** Zooms to `k` keeping the point `p` (from the photo's centre) where it is on screen. */
  const zoomAt = (k: number, px: number, py: number) => settle(k, px - ((px - z.x) * k) / z.k, py - ((py - z.y) * k) / z.k);

  /** Where the fingers are, from the photo's centre, and how far apart. */
  const fingers = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    const n = t.length || 1;
    let x = 0;
    let y = 0;
    // Page positions: a finger's position within a view shifts as the photo moves under it.
    for (const p of t) {
      x += p.pageX - live.left;
      y += p.pageY - live.top;
    }
    const d = t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
    return { fx: x / n - live.w / 2, fy: y / n - live.h / 2, d, n: t.length };
  };

  /** A finger was added or lifted: carry on from where things are now. */
  const rebase = (e: GestureResponderEvent, g: PanResponderGestureState) => {
    const f = fingers(e);
    z.k0 = z.k;
    z.x0 = z.x;
    z.y0 = z.y;
    z.d0 = f.d;
    z.fx0 = f.fx;
    z.fy0 = f.fy;
    z.ox = g.dx;
    z.oy = g.dy;
    z.fingers = f.n;
    if (f.n >= 2) {
      // A swipe that turns into a pinch: put the page back in place first.
      if (z.mode === 'page') Animated.spring(pageX, { toValue: -live.index * live.w, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
      z.mode = 'pinch';
    }
    else if (z.mode !== 'page') z.mode = z.k > 1 ? 'pan' : 'page';
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, g) => {
        z.mode = 'none';
        z.moved = false;
        z.startAt = Date.now();
        rebase(e, g);
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP || e.nativeEvent.touches.length >= 2) z.moved = true;
        if (e.nativeEvent.touches.length !== z.fingers) rebase(e, g);
        if (z.mode === 'pinch' && e.nativeEvent.touches.length >= 2) {
          const f = fingers(e);
          const k = Math.max(1, Math.min(MAX_ZOOM, (z.k0 * f.d) / (z.d0 || f.d)));
          // The point under the fingers stays under them, and follows them.
          show(k, f.fx - ((z.fx0 - z.x0) * k) / z.k0, f.fy - ((z.fy0 - z.y0) * k) / z.k0);
        } else if (z.mode === 'pan') {
          show(z.k, z.x0 + g.dx - z.ox, z.y0 + g.dy - z.oy);
        } else if (z.mode === 'page') {
          let dx = g.dx - z.ox;
          // Pull against the ends with resistance.
          if ((live.index === 0 && dx > 0) || (live.index === live.count - 1 && dx < 0)) dx /= 3;
          pageX.setValue(-live.index * live.w + dx);
        }
      },
      onPanResponderRelease: (e, g) => {
        const tap = !z.moved && Date.now() - z.startAt < 300;
        if (tap) {
          const now = Date.now();
          if (now - z.lastTap < DOUBLE_TAP_MS) {
            z.lastTap = 0;
            const f = fingers({ nativeEvent: { ...e.nativeEvent, touches: e.nativeEvent.changedTouches } } as GestureResponderEvent);
            if (z.k > 1) settle(1, 0, 0);
            else zoomAt(STEPS[0], f.fx, f.fy);
          } else z.lastTap = now;
          return;
        }
        if (z.mode === 'page') {
          const dx = g.dx - z.ox;
          const turn = Math.abs(dx) > live.w * 0.2 || Math.abs(g.vx) > 0.4;
          goTo(turn ? live.index + (dx < 0 ? 1 : -1) : live.index);
        } else settle(z.k, z.x, z.y);
        z.mode = 'none';
      },
      onPanResponderTerminate: () => {
        settle(z.k, z.x, z.y);
        goTo(live.index);
        z.mode = 'none';
      },
    }),
  ).current;

  const stepZoom = () => {
    const next = STEPS.find((k) => k > z.k + 0.05);
    if (next) zoomAt(next, 0, 0);
    else settle(1, 0, 0);
  };

  const current = photos[Math.min(index, photos.length - 1)];
  const fg = light ? '#000' : '#fff';
  const zoomLabel = level >= STEPS[STEPS.length - 1] - 0.05 ? 'Zoom out' : 'Zoom in';
  return (
    <Modal visible={!!openId && photos.length > 0} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewer, { backgroundColor: light ? '#fff' : '#000', paddingTop: insets.top }]}>
        {photos.length > 1 ? (
          <Text style={[styles.count, { color: fg }]} accessibilityLiveRegion="polite">
            {index + 1} of {photos.length}
          </Text>
        ) : null}
        <View
          ref={stage as never}
          style={styles.stage}
          onLayout={(e) => {
            setHeight(e.nativeEvent.layout.height);
            stage.current?.measure((_x, _y, _w, _h, left, top) => {
              live.left = left;
              live.top = top;
            });
          }}
          {...responder.panHandlers}
        >
          <Animated.View style={[styles.row, { width: width * photos.length, transform: [{ translateX: pageX }] }]}>
            {photos.map((p, i) => (
              <View key={p.id} style={[styles.page, { width, height }]}>
                {/* Only pages near the one showing load their picture. */}
                {Math.abs(i - index) <= 1 ? (
                  i === index ? (
                    <Animated.Image
                      source={{ uri: p.uri }}
                      resizeMode="contain"
                      accessibilityLabel={label}
                      accessibilityHint="Pinch or double-tap to zoom"
                      style={[styles.image, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}
                    />
                  ) : (
                    <Image source={{ uri: p.uri }} resizeMode="contain" style={styles.image} />
                  )
                ) : null}
              </View>
            ))}
          </Animated.View>
        </View>
        <View style={[styles.bar, { paddingBottom: space.l + insets.bottom }]}>
          {onRemove && current ? (
            <Text style={[styles.link, { color: '#ff8a80' }]} onPress={() => onRemove(current)} accessibilityRole="button">
              Remove
            </Text>
          ) : (
            <View />
          )}
          {current ? (
            <Text style={styles.link} onPress={stepZoom} accessibilityRole="button">
              {zoomLabel}
            </Text>
          ) : null}
          <Text style={styles.link} onPress={onClose} accessibilityRole="button">
            Close
          </Text>
        </View>
      </View>
    </Modal>
  );
}

type Mode = 'none' | 'page' | 'pan' | 'pinch';

const styles = StyleSheet.create({
  viewer: { flex: 1 },
  // Above a zoomed photo, wherever a platform lets it spill.
  count: { textAlign: 'center', fontSize: 14, fontWeight: '600', paddingVertical: space.s, zIndex: 2 },
  stage: { flex: 1, overflow: 'hidden', zIndex: 1 },
  row: { flexDirection: 'row', flex: 1 },
  page: { overflow: 'hidden' },
  image: { flex: 1, width: '100%' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.l, backgroundColor: '#000', zIndex: 2, elevation: 2 },
  link: { color: '#fff', fontSize: 17, fontWeight: '600', padding: space.s },
});
