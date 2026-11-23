import Svg, { Circle, Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';

type IconProps = { color: ColorValue; size?: number; focused?: boolean };

/** Today: a clock face. */
export function ClockIcon({ color, size = 24, focused }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color as string} strokeWidth={focused ? 2.4 : 2} strokeLinecap="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </Svg>
  );
}

/** Trip: a plane. */
export function PlaneIcon({ color, size = 24, focused }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color as string} strokeWidth={focused ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
    </Svg>
  );
}

/** Items: the pocket from the logo, as an outline. */
export function PocketIcon({ color, size = 24, focused }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none" stroke={color as string} strokeWidth={focused ? 6 : 5} strokeLinejoin="round">
      <Path d="M16 16h40v28c0 8-6 13-13 16l-7 3-7-3c-7-3-13-8-13-16V16Z" />
      <Path d="M16 29c7-5 14-5 20-1s13 4 20-1" />
    </Svg>
  );
}

/** The StashCall logo: cream pocket, amber flap and ping, on navy. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      <Path d="M0 16C0 7 7 0 16 0h40c9 0 16 7 16 16v40c0 9-7 16-16 16H16C7 72 0 65 0 56Z" fill="#1B2A41" />
      <Path d="M20 24h28v19c0 6-4.4 9.6-9.6 12.2L34 57.4l-4.4-2.2C24.4 52.6 20 49 20 43V24Z" fill="#F4EEE2" />
      <Path d="M20 24h28v6c-4.4 4-9.6 4-14 1.3s-9.6-2.7-14 1.3V24Z" fill="#E9A23B" />
      <Circle cx={51.5} cy={19.5} r={4.6} fill="#E9A23B" />
    </Svg>
  );
}
