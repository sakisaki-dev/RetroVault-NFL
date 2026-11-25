/// <reference types="vite/client" />

/** True when public/private-sprites/ (the owner's Retro Bowl sprites) exists in the checkout that builds. */
declare const __PRIVATE_SPRITES__: boolean;

interface ImportMetaEnv {
  readonly VITE_EDITION?: string;
  /** '1' on a static host with no /espn-content proxy (the public NFL Pages build) */
  readonly VITE_STATIC_HOST?: string;
}
