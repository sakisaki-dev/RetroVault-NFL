// Retro Vault NFL widget for Scriptable: paste this once into a new Scriptable script (name it "RV NFL").
// It downloads the latest widget code from the private repo github.com/sakisaki-dev/rv-nfl-widget on every refresh (and
// keeps the last good copy for offline use), so the widget updates itself whenever the data is published.
// One-time setup: save a read-only token in the Keychain (Scriptable > a new script, run once, then delete it):
//     Keychain.set('rv-nfl-token', 'github_pat_...');
// Then add a Scriptable widget (any size, or a lock screen one), choose this script.

const REPO = 'sakisaki-dev/rv-nfl-widget';
const fm = FileManager.local();
const cached = fm.joinPath(fm.documentsDirectory(), 'rv-nfl-widget-cache.js');
let code = null;
try {
  if (Keychain.contains('rv-nfl-token')) {
    const r = new Request(`https://api.github.com/repos/${REPO}/contents/rv-nfl-widget.js?ref=main`);
    r.timeoutInterval = 12;
    r.headers = { Authorization: 'Bearer ' + Keychain.get('rv-nfl-token'), Accept: 'application/vnd.github.raw' };
    const text = await r.loadString();
    if (!/^\s*</.test(text) && text.includes('ListWidget')) { code = text; fm.writeString(cached, code); }
  }
} catch (e) {
  /* offline or a bad token: use the cached copy */
}
if (!code && fm.fileExists(cached)) code = fm.readString(cached);
if (!code) {
  const w = new ListWidget();
  w.addText('RV NFL: no token or no connection yet');
  Script.setWidget(w);
  Script.complete();
} else {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(code)();
}
