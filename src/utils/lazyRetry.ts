import { lazy, type ComponentType } from 'react';

/** True for the errors a stale or missing code chunk throws (after a rebuild while a tab is open, or a dropped connection). */
export const isChunkError = (e: unknown) => {
  const m = `${(e as { name?: string })?.name ?? ''} ${(e as { message?: string })?.message ?? ''}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(m);
};

/** React.lazy that retries a failed import once (a blip) before the tab boundary shows its reload card. */
export const lazyRetry = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>) =>
  lazy(() =>
    load().catch(
      (e) =>
        new Promise<{ default: T }>((resolve, reject) => {
          if (!isChunkError(e)) return reject(e);
          window.setTimeout(() => load().then(resolve, reject), 600);
        }),
    ),
  );
