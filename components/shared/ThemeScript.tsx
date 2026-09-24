// Inline, blocking script that sets the `dark` class before paint — prevents
// a flash of the wrong theme on load. Kept tiny and dependency-free.
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var stored = localStorage.getItem('iq-theme');
        var isDark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
