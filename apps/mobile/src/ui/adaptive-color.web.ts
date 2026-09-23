// Keep the shared palette dynamic on web, as DynamicColorIOS does on iPhone.
// CSS variables are supported by React Native Web's color normalization.
export function adaptiveColor(light: string, dark: string): string {
  const name = `healthapp-color-${Array.from(`${light}|${dark}`, (c) => c.charCodeAt(0).toString(16)).join("")}`;
  if (typeof document !== "undefined") {
    let sheet = document.getElementById("healthapp-adaptive-colors");
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.id = "healthapp-adaptive-colors";
      document.head.appendChild(sheet);
    }
    if (!sheet.textContent?.includes(`--${name}:`)) {
      sheet.appendChild(
        document.createTextNode(
          `:root { --${name}: ${light}; } :root[data-healthapp-appearance="dark"] { --${name}: ${dark}; } @media (prefers-color-scheme: dark) { :root[data-healthapp-appearance="system"] { --${name}: ${dark}; } }`,
        ),
      );
    }
  }
  return `var(--${name}, ${light})`;
}
