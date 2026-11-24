import { Component, type ReactNode } from 'react';
import { PixelBall } from '@/components/ui/PixelLoader';
import { isChunkError } from '@/utils/lazyRetry';

const FLAG = 'retroVault:chunkReload';

/**
 * Wraps the tabs. A code chunk that fails to load (the site was rebuilt while this tab was open) used to leave a blank
 * page. This shows a pixel card, "This page was updated", and one tap reloads (once per minute, so a genuinely broken
 * build can't loop). Any other render error is left to the app's CrashScreen.
 */
export default class TabBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reload = () => {
    try {
      sessionStorage.setItem(FLAG, String(Date.now()));
    } catch {
      // storage unavailable: reload anyway
    }
    window.location.reload();
  };
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isChunkError(error)) throw error;
    let again = false;
    try {
      again = Date.now() - Number(sessionStorage.getItem(FLAG) || 0) < 60_000;
    } catch {
      // ignore
    }
    return (
      <div className="container flex justify-center pt-[14vh]" role="alert">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-gold/50 bg-panel p-6 text-center shadow-elevated" style={{ boxShadow: '0 0 0 3px #000, 0 0 28px #ffc83d33' }}>
          <PixelBall className="w-16" />
          <p className="font-pixel text-[11px] uppercase leading-relaxed text-gold">{again ? 'Still can’t load this page' : 'This page was updated'}</p>
          <p className="text-sm text-muted-foreground">{again ? 'Check your connection, then try once more.' : 'A newer version is ready. Reload to pick it up.'}</p>
          <button type="button" onClick={this.reload} className="min-h-[44px] rounded-md bg-gold px-5 font-display text-base font-extrabold uppercase text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chalk">
            Tap to reload
          </button>
        </div>
      </div>
    );
  }
}
