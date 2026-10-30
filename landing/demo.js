(() => {
  const app = document.getElementById("app-demo");
  const fileList = document.getElementById("demo-files");
  const findOverlay = document.getElementById("find-overlay");
  const previewOverlay = document.getElementById("preview-overlay");
  const search = document.getElementById("demo-search");
  const results = document.getElementById("find-results");
  const folders = {
    Documents: [
      { name: "Design", folder: true, date: "Oct 28", size: "—" },
      { name: "Projects", folder: true, date: "Oct 26", size: "—" },
      { name: "Invoice-0142.pdf", date: "Oct 21", size: "104 KB" },
      { name: "Notes.md", date: "Oct 20", size: "3 KB" },
      { name: "Project brief.md", date: "Oct 18", size: "8 KB" },
      { name: "Reading list.txt", date: "Oct 16", size: "2 KB" },
      { name: "Report-Q3.pdf", date: "Oct 12", size: "65 KB" },
      { name: "Weekend plans.md", date: "Oct 10", size: "1 KB" },
    ],
    Home: ["Documents", "Downloads", "Projects"].map((name) => ({
      name,
      folder: true,
      date: "Oct 28",
      size: "—",
    })),
    Downloads: [
      { name: "Getting started.pdf", date: "Oct 28", size: "42 KB" },
      { name: "Release notes.md", date: "Oct 27", size: "6 KB" },
    ],
    Projects: [
      { name: "Frost notes.md", date: "Oct 28", size: "4 KB" },
      { name: "README.md", date: "Oct 26", size: "3 KB" },
      { name: "Ideas.txt", date: "Oct 22", size: "1 KB" },
    ],
    Design: [
      { name: "Design principles.md", date: "Oct 28", size: "5 KB" },
      { name: "Typography notes.md", date: "Oct 27", size: "2 KB" },
    ],
  };
  let folder = "Documents";
  let selected = "Invoice-0142.pdf";
  let grid = false;
  let returnFocus;
  const icon = (name, className = "") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${name}`);
    svg.append(use);
    return svg;
  };
  function span(text, className) {
    const element = document.createElement("span");
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function announce(text) {
    document.getElementById("demo-announcement").textContent = text;
  }
  function renderFiles() {
    fileList.replaceChildren();
    fileList.classList.toggle("grid-view", grid);
    app.querySelector(".demo-columns").hidden = grid;
    document.getElementById("folder-name").textContent = folder;
    document.getElementById("demo-folder-status").textContent = folder;
    document.getElementById("demo-count").textContent =
      `${folders[folder].length} items`;
    app.querySelectorAll("[data-folder]").forEach((button) => {
      if (button.dataset.folder === folder)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    folders[folder].forEach((file) => {
      const button = document.createElement("button");
      button.className = "demo-file";
      button.dataset.name = file.name;
      button.setAttribute("aria-pressed", String(selected === file.name));
      button.setAttribute(
        "aria-label",
        `${file.name}${file.folder ? ", folder" : ""}`,
      );
      const name = span("", "demo-file-name");
      name.append(
        icon(file.folder ? "folder" : "file", file.folder ? "folder-icon" : ""),
        span(file.name),
      );
      button.append(
        name,
        span(file.date, "demo-file-date"),
        span(file.size, "demo-file-size"),
      );
      button.addEventListener("click", () => {
        selected = file.name;
        fileList
          .querySelectorAll(".demo-file")
          .forEach((row) =>
            row.setAttribute("aria-pressed", String(row === button)),
          );
      });
      button.addEventListener("dblclick", () => openFile(file));
      button.addEventListener("keydown", (event) => {
        if ([" ", "Enter"].includes(event.key)) {
          event.preventDefault();
          selected = file.name;
          openFile(file);
        } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          const rows = [...fileList.querySelectorAll(".demo-file")];
          const index =
            rows.indexOf(button) + (event.key === "ArrowDown" ? 1 : -1);
          if (rows[index]) {
            rows[index].focus();
            rows[index].click();
          }
        }
      });
      fileList.append(button);
    });
  }
  function navigate(name) {
    folder = name;
    selected = "";
    closeOverlay(false);
    renderFiles();
    announce(`${folder}, ${folders[folder].length} sample items`);
  }
  function openOverlay(overlay) {
    if (findOverlay.hidden && previewOverlay.hidden)
      returnFocus = document.activeElement;
    findOverlay.hidden = true;
    previewOverlay.hidden = true;
    overlay.hidden = false;
    overlay.querySelector("input, button, [tabindex]").focus();
  }
  function closeOverlay(restore = true) {
    findOverlay.hidden = true;
    previewOverlay.hidden = true;
    if (restore && returnFocus?.isConnected) returnFocus.focus();
  }
  function openFile(file) {
    if (file.folder) {
      navigate(file.name);
      fileList.querySelector("button")?.focus();
      return;
    }
    document.getElementById("preview-name").textContent = file.name;
    const paper = document.createElement("article");
    paper.className = "sample-document";
    const label = document.createElement("small");
    label.textContent = "SAMPLE DOCUMENT";
    const title = document.createElement("h4");
    const text = document.createElement("p");
    if (file.name === "Invoice-0142.pdf") {
      title.textContent = "Invoice / 0142";
      text.textContent = "Design exploration · October 2026";
      const total = document.createElement("p");
      total.className = "invoice-total";
      total.append(span("Total"), span("$240.00"));
      paper.append(label, title, text, document.createElement("hr"), total);
    } else {
      title.textContent = file.name.replace(/\.[^.]+$/, "");
      text.textContent =
        "A place for the work in progress. Keep the next step clear, leave room for the details, and come back when you need them.";
      const note = document.createElement("p");
      note.textContent =
        "This is a sample preview. The demo does not access your files.";
      paper.append(label, title, text, document.createElement("hr"), note);
    }
    document.getElementById("preview-content").replaceChildren(paper);
    openOverlay(previewOverlay);
    announce(`Previewing ${file.name}`);
  }
  function renderResults() {
    const query = search.value.trim().toLocaleLowerCase();
    const files = Object.values(folders)
      .flat()
      .filter(
        (file) => !file.folder && file.name.toLocaleLowerCase().includes(query),
      );
    results.replaceChildren();
    files.forEach((file) => {
      const button = document.createElement("button");
      button.className = "find-result";
      button.append(icon("file"), span(file.name));
      button.addEventListener("click", () => openFile(file));
      button.addEventListener("keydown", (event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          const target =
            event.key === "ArrowDown"
              ? button.nextElementSibling
              : button.previousElementSibling;
          if (target) target.focus();
          else search.focus();
        }
      });
      results.append(button);
    });
    if (!files.length) {
      const empty = document.createElement("p");
      empty.textContent = "No sample files match. Try ‘notes’ or ‘invoice’.";
      results.append(empty);
    }
  }
  function openFind() {
    openOverlay(findOverlay);
    search.value = "";
    renderResults();
    search.focus();
  }
  document.getElementById("open-find").addEventListener("click", openFind);
  document.getElementById("find-step").addEventListener("click", openFind);
  document
    .getElementById("browse-step")
    .addEventListener("click", () => navigate("Documents"));
  document
    .getElementById("preview-step")
    .addEventListener("click", () => openFile(folders.Documents[2]));
  app
    .querySelectorAll("[data-folder]")
    .forEach((button) =>
      button.addEventListener("click", () => navigate(button.dataset.folder)),
    );
  document.getElementById("view-toggle").addEventListener("click", (event) => {
    grid = !grid;
    const button = event.currentTarget;
    button.setAttribute("aria-pressed", String(grid));
    button.setAttribute(
      "aria-label",
      `Switch demo to ${grid ? "list" : "grid"} view`,
    );
    button.replaceChildren(icon(grid ? "list" : "grid"));
    renderFiles();
    announce(`${grid ? "Grid" : "List"} view`);
  });
  document.getElementById("theme-toggle").addEventListener("click", (event) => {
    const dark = app.dataset.theme !== "dark";
    app.dataset.theme = dark ? "dark" : "light";
    event.currentTarget.setAttribute("aria-pressed", String(dark));
    event.currentTarget.setAttribute(
      "aria-label",
      `Use ${dark ? "light" : "dark"} appearance in the demo`,
    );
    event.currentTarget.replaceChildren(
      icon(dark ? "sun" : "moon"),
      span(`${dark ? "Light" : "Dark"} appearance`),
    );
  });
  search.addEventListener("input", renderResults);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      results.querySelector("button")?.click();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      results.querySelector("button")?.focus();
    }
  });
  app
    .querySelectorAll(".close-overlay")
    .forEach((button) =>
      button.addEventListener("click", () => closeOverlay()),
    );
  [findOverlay, previewOverlay].forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeOverlay();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
      }
      if (event.key === "Tab") {
        const controls = [...overlay.querySelectorAll("button, input")];
        const first = controls[0],
          last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement.getAttribute("role") === "dialog")
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  });
  app.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openFind();
    }
  });
  document
    .getElementById("copy-install")
    .addEventListener("click", async (event) => {
      const status = document.getElementById("copy-status");
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(
          document.getElementById("install-commands").textContent,
        );
        button.textContent = "Copied";
        status.textContent = "Commands copied to your clipboard.";
      } catch {
        status.textContent = "Select and copy the commands above.";
      }
    });
  renderFiles();
})();
