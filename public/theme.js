// Runs before the app and its styles load, using the same stored preference.
(() => {
  let preference = "system";
  try {
    const saved = JSON.parse(localStorage.getItem("frost:theme"));
    if (["light", "dark", "system"].includes(saved)) preference = saved;
  } catch {
    // Storage may be unavailable; follow the operating system instead.
  }
  const theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#1e1e20" : "#ffffff");
})();
