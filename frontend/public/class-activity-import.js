(() => {
  const panelId = "lw-class-activity-importer";
  const tokenKey = "lw_token";
  const template = {
    activities: [{
      weekNumber: 1,
      title: "Week 1 Class Activity",
      instructions: "Answer these questions based on this week's materials.",
      allowRetakes: false,
      questions: [
        {
          prompt: "Which command lists files in the current directory?",
          questionType: "single_choice",
          options: ["pwd", "ls", "cd", "mkdir"],
          correctIndex: 1,
          explanation: "The ls command lists directory contents."
        },
        {
          prompt: "In your own words, explain what a version control system helps a team do.",
          questionType: "short_answer",
          correctText: "track changes | manage changes",
          explanation: "Version control records and coordinates changes to files."
        }
      ]
    }]
  };

  const token = () => localStorage.getItem(tokenKey) || "";
  const staffPageVisible = () => [...document.querySelectorAll(".class-activity-center")]
    .some(section => section.querySelector(".class-activity-staff-layout"));

  function addMaterialsDownloadButton() {
    const header = document.querySelector(".class-activity-center .class-activity-page-head");
    if (!header || header.querySelector("[data-download-materials]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.downloadMaterials = "true";
    button.textContent = "Download all course materials (.zip)";
    Object.assign(button.style, {
      flex: "0 0 auto", marginTop: "8px", padding: "11px 16px", border: "0", borderRadius: "8px",
      background: "#082d65", color: "#fff", font: "700 14px/1.3 system-ui, sans-serif", cursor: "pointer"
    });
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Preparing ZIP…";
      try {
        const response = await fetch("/api/staff/learning/materials/export.zip", { headers: { Authorization: `Bearer ${token()}` } });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.message || `Download failed (HTTP ${response.status}).`);
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "livingworth-course-materials.zip";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        button.textContent = "Download started ✓";
        setTimeout(() => { button.textContent = "Download all course materials (.zip)"; }, 2500);
      } catch (error) {
        button.textContent = error.message || "Download failed";
        setTimeout(() => { button.textContent = "Download all course materials (.zip)"; }, 3500);
      } finally { button.disabled = false; }
    });
    header.append(button);
  }

  function makePanel(weeks) {
    const panel = document.createElement("details");
    panel.id = panelId;
    panel.innerHTML = `
      <summary>Import weekly activities</summary>
      <p>Paste the JSON file contents below. This saves through your signed-in staff session. Weeks with learner attempts are protected.</p>
      <button type="button" data-template>Download JSON template</button>
      <label data-file-label>Choose prepared activity JSON<input type="file" accept=".json,application/json" data-json-file></label>
      <label>Weekly activity JSON<textarea rows="9" spellcheck="false" placeholder='{"activities":[{"weekNumber":1,"title":"Week 1 Class Activity","questions":[...]}]}'></textarea></label>
      <button type="button" data-import>Import activities</button>
      <p role="status" data-status></p>`;
    Object.assign(panel.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: "9999", width: "min(540px, calc(100vw - 36px))",
      maxHeight: "76vh", overflow: "auto", padding: "15px", border: "1px solid #cbd9e0", borderRadius: "12px",
      background: "#fff", color: "#183c50", boxShadow: "0 12px 40px #082d6530", font: "14px/1.5 system-ui, sans-serif"
    });
    const summary = panel.querySelector("summary");
    Object.assign(summary.style, { cursor: "pointer", fontWeight: "800", color: "#082d65" });
    const textarea = panel.querySelector("textarea");
    Object.assign(textarea.style, { display: "block", boxSizing: "border-box", width: "100%", marginTop: "6px", padding: "10px", border: "1px solid #bdccd3", borderRadius: "8px", font: "12px/1.5 ui-monospace, monospace" });
    const fileLabel = panel.querySelector("[data-file-label]");
    Object.assign(fileLabel.style, { display: "grid", gap: "6px", margin: "10px 0", fontWeight: "700" });
    Object.assign(panel.querySelector("[data-json-file]").style, { display: "block", maxWidth: "100%", fontWeight: "400" });
    panel.querySelectorAll("button").forEach(button => Object.assign(button.style, { margin: "4px 8px 4px 0", padding: "8px 12px", border: "1px solid #bdccd3", borderRadius: "7px", background: "#f5f9fa", color: "#123a65", cursor: "pointer", fontWeight: "700" }));

    panel.querySelector("[data-json-file]").addEventListener("change", async event => {
      const file = event.currentTarget.files?.[0];
      const status = panel.querySelector("[data-status]");
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { status.textContent = "Choose a JSON file smaller than 2 MB."; return; }
      try {
        const imported = JSON.parse(await file.text());
        if (!Array.isArray(imported?.activities) || !imported.activities.length) throw new Error('The file needs an "activities" array.');
        textarea.value = JSON.stringify(imported, null, 2);
        status.textContent = `Loaded ${imported.activities.length} weekly activities from ${file.name}. Click Import activities to save them.`;
      } catch (error) { status.textContent = error.message || "Could not read that JSON file."; }
    });

    panel.querySelector("[data-template]").addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }));
      link.download = "class-activity-import-template.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });

    panel.querySelector("[data-import]").addEventListener("click", async event => {
      const button = event.currentTarget;
      const status = panel.querySelector("[data-status]");
      let data;
      try { data = JSON.parse(textarea.value); }
      catch { status.textContent = "The import must be valid JSON. Download the template to check the format."; return; }
      if (!Array.isArray(data?.activities) || !data.activities.length) { status.textContent = 'Add an "activities" array with at least one activity.'; return; }
      const byWeek = new Map(weeks.map(week => [Number(week.weekNumber), week]));
      const seen = new Set();
      for (const activity of data.activities) {
        const weekNo = Number(activity.weekNumber);
        if (!byWeek.has(weekNo)) { status.textContent = `Week ${activity.weekNumber} does not exist in this class.`; return; }
        if (seen.has(weekNo)) { status.textContent = `Week ${weekNo} appears more than once in this import.`; return; }
        if (!Array.isArray(activity.questions)) { status.textContent = `Week ${weekNo} needs a questions array.`; return; }
        seen.add(weekNo);
      }
      if (!window.confirm(`Import ${data.activities.length} weekly activit${data.activities.length === 1 ? "y" : "ies"}? Existing activities without attempts will be replaced.`)) return;
      button.disabled = true;
      status.textContent = "Importing…";
      let saved = 0;
      const failures = [];
      try {
        for (const activity of data.activities) {
          const week = byWeek.get(Number(activity.weekNumber));
          try {
            const response = await fetch(`/api/staff/class-activities/${week.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
              body: JSON.stringify({ title: activity.title, instructions: activity.instructions || "", allowRetakes: Boolean(activity.allowRetakes), questions: activity.questions })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
            saved += 1;
          } catch (error) { failures.push(`Week ${week.weekNumber}: ${error.message}`); }
        }
        status.textContent = `Imported ${saved} of ${data.activities.length}.${failures.length ? ` ${failures.join(" · ")}` : ""}`;
        if (saved === data.activities.length) textarea.value = "";
      } finally { button.disabled = false; }
    });
    return panel;
  }

  let checking = false;
  async function syncPanel() {
    if (checking) return;
    checking = true;
    try {
      const existing = document.getElementById(panelId);
      if (!staffPageVisible() || !token()) { existing?.remove(); return; }
      addMaterialsDownloadButton();
      if (existing) return;
      const response = await fetch("/api/staff/class-activities", { headers: { Authorization: `Bearer ${token()}` } });
      if (!response.ok) return;
      const weeks = await response.json();
      if (!staffPageVisible() || document.getElementById(panelId)) return;
      document.body.append(makePanel(weeks));
    } finally { checking = false; }
  }

  new MutationObserver(() => { void syncPanel(); }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("storage", () => { void syncPanel(); });
  void syncPanel();
})();
