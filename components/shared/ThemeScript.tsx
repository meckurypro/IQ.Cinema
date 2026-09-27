// Inline, blocking script that sets the `dark` class before paint — prevents
// a flash of the wrong theme on load. Kept tiny and dependency-free.
//
// It also sets the theme-color meta tag (the browser's own status bar /
// toolbar tint) to match, using the same hex values as --bg in
// globals.css — keep these two in sync if that token ever changes.
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var stored = localStorage.getItem('iq-theme');
        var isDark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);
        var meta = document.getElementById('theme-color-meta');
        if (meta) meta.setAttribute('content', isDark ? '#0b0c10' : '#faf9f7');
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
