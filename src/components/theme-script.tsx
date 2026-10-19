/**
 * Applies the theme before first paint, so nothing flashes.
 *
 * The product ships light: with no stored preference the root is stamped
 * `light`. A viewer can still choose dark, or "system" to follow their OS —
 * "system" is stored explicitly and clears the attribute so the
 * prefers-color-scheme rules in globals.css take over.
 */
const SCRIPT = `
(function () {
  var root = document.documentElement;
  try {
    var stored = localStorage.getItem("cadence-theme");
    if (stored === "dark" || stored === "light") {
      root.setAttribute("data-theme", stored);
    } else if (stored === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", "light");
    }
  } catch (error) {
    /* Storage blocked (private mode, locked-down browser): ship light anyway. */
    root.setAttribute("data-theme", "light");
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
