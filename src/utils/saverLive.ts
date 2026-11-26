import { useSyncExternalStore } from 'react';

/**
 * The screensaver's "Live games" setting (owner: "for when games are happening also default the screensaver to show the
 * score"): Auto plays the live scenes most of the time while any NFL game is on (one normal scene in every four), Always
 * plays only them, Off never does. Kept on this device (rv:saver:live), every access in try/catch.
 */
export type SaverLive = 'auto' | 'always' | 'off';
export const SAVER_LIVE_KEY = 'rv:saver:live';
export const SAVER_LIVE_CHOICES: { id: SaverLive; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'always', label: 'Always' },
  { id: 'off', label: 'Off' },
];
let value: SaverLive = (() => {
  try {
    const v = localStorage.getItem(SAVER_LIVE_KEY) as SaverLive | null;
    return v === 'always' || v === 'off' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
})();
const listeners = new Set<() => void>();
export const setSaverLive = (v: SaverLive) => {
  value = v;
  try {
    localStorage.setItem(SAVER_LIVE_KEY, v);
  } catch {
    /* this visit only */
  }
  listeners.forEach((l) => l());
};
export const useSaverLive = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => value,
    (): SaverLive => 'auto',
  );
