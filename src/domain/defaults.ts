/** Default assumptions. Each is shown to the user and editable per trip. */
export const DEFAULTS = {
  bufferMinutesInternational: 180,
  bufferMinutesDomestic: 120,
  travelMinutes: 60,
  getReadyMinutes: 60,
  packTime: '20:00',
  sweepMinutesBefore: 60,
  /** Final "check your items" nudge before leaving home. */
  leaveCheckMinutesBefore: 10,
} as const;
