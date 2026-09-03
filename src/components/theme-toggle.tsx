"use client";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem("travel-cards-theme", theme); } catch {}
  }

  return <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="切换日间或夜间模式"><span className="show-when-light" aria-hidden="true">☾</span><span className="show-when-dark" aria-hidden="true">☀</span><span className="theme-toggle-label show-when-light">夜间</span><span className="theme-toggle-label show-when-dark">日间</span></button>;
}
