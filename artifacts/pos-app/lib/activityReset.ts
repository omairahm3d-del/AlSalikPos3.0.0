/**
 * Module-level mutable ref holding the inactivity-timer reset function.
 *
 * AppContent in _layout.tsx assigns `activityResetFn.current = resetTimer`
 * after creating the timer.  Any React Native Modal (which renders outside
 * the normal view hierarchy and therefore cannot propagate touch events to
 * the outer View's onStartShouldSetResponderCapture) imports this ref and
 * calls `activityResetFn.current()` from its own
 * onStartShouldSetResponderCapture so that interactions inside modals also
 * keep the inactivity timer alive.
 */
export const activityResetFn: { current: () => void } = { current: () => {} };
