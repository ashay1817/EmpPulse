/* =======================================================
   EmpPulse - Frontend SPA Application Logic
   app.js - Tab switching, API calls, Prediction, Directory
======================================================= */

// ─── State ────────────────────────────────────────────
let currentPage = 1;
let dirSearchTimeout = null;
const PAGE_LIMIT = 10;

// Tab-specific metadata for header
const TAB_META = {
  dashboard: {
    title: "Dashboard Overview",
    subtitle: "Real-time organizational insights and model tracking",
  },
  predictor: {
    title: "ML Performance Predictor",
    subtitle:
      "Simulate employee performance ratings using the Random Forest model",
  },
  analytics: {
    title: "Analytics & EDA Plots",
    subtitle:
      "Pre-generated visual insights from the exploratory data analysis pipeline",
  },
  directory: {
    title: "Employee Directory",
    subtitle: "Search, filter, and paginate across 5,001 employee records",
  },
};

// Preset templates for predictor
const PRESETS = {
  star: {
    age: 38,
    gender: "Female",
    department: "IT",
    experience: 14,
    salary: 130000,
    attendance: 99,
    training: 80,
    projects: 10,
    overtime: 45,
    manager: 5,
    promotion: 1,
  },
  struggling: {
    age: 29,
    gender: "Male",
    department: "Sales",
    experience: 2,
    salary: 45000,
    attendance: 80,
    training: 15,
    projects: 2,
    overtime: 10,
    manager: 1,
    promotion: 0,
  },
  new_joiner: {
    age: 24,
    gender: "Female",
    department: "HR",
    experience: 0,
    salary: 42000,
    attendance: 92,
    training: 60,
    projects: 3,
    overtime: 20,
    manager: 3,
    promotion: 0,
  },
  average: {
    age: 40,
    gender: "Male",
    department: "Operations",
    experience: 10,
    salary: 79000,
    attendance: 94,
    training: 50,
    projects: 5,
    overtime: 30,
    manager: 3,
    promotion: 0,
  },
};

// ─── Tab Switching ─────────────────────────────────────
function switchTab(tab) {
  // Update nav button states
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(`tab-btn-${tab}`).classList.add("active");

  // Update panels
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.remove("active");
  });
  document.getElementById(`panel-${tab}`).classList.add("active");

  // Update header text
  const meta = TAB_META[tab];
  document.getElementById("header-title").textContent = meta.title;
  document.getElementById("header-subtitle").textContent = meta.subtitle;

  // Lazy load data when switching tabs
  if (tab === "directory" && currentPage === 1) {
    loadDirectory();
  }
}

// ─── Slider Value Updates ──────────────────────────────
function updateSliderVal(key, value) {
  const formats = {
    salary: `Rs ${parseInt(value).toLocaleString('en-IN')}`,
    attendance: `${parseFloat(value).toFixed(1)}%`,
    training: `${parseInt(value)} hrs`,
  };
  document.getElementById(`val-${key}`).textContent =
    formats[key] || String(value);
}

// ─── Dashboard: Load Stats ─────────────────────────────
async function loadDashboardStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) throw new Error(`Stats API error: ${res.status}`);
    const data = await res.json();

    // Fill stat cards
    animateCount("stat-total-employees", 0, data.total_employees, 1200, false);
    animateCount(
      "stat-avg-performance",
      0,
      data.avg_performance,
      1000,
      true,
      2
    );
    document.getElementById("stat-avg-attendance").textContent =
      `${data.avg_attendance}%`;
    document.getElementById("stat-promotion-rate").textContent =
      `${data.promotion_rate}%`;

    // Performance bar
    const barWidth = (data.avg_performance / 5) * 100;
    setTimeout(() => {
      document.getElementById(
        "stat-avg-performance-bar"
      ).style.width = `${barWidth}%`;
    }, 300);

    // Department cards
    renderDepartments(data.departments);

    // Manager ratings chart
    renderManagerBars(data.manager_ratings);
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

// Animate numeric counter
function animateCount(elId, from, to, duration, isFloat, decimals = 0) {
  const el = document.getElementById(elId);
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
    const current = from + (to - from) * eased;
    el.textContent = isFloat
      ? current.toFixed(decimals)
      : Math.round(current).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Render department list rows
function renderDepartments(departments) {
  const container = document.getElementById("dept-list-container");
  if (!departments || departments.length === 0) {
    container.innerHTML =
      '<div class="loading-spinner">No department data found.</div>';
    return;
  }

  const maxCount = Math.max(...departments.map((d) => d.count));
  const deptColors = [
    "linear-gradient(90deg, #3b82f6, #6366f1)",
    "linear-gradient(90deg, #a855f7, #6366f1)",
    "linear-gradient(90deg, #10b981, #3b82f6)",
    "linear-gradient(90deg, #f59e0b, #ef4444)",
    "linear-gradient(90deg, #6366f1, #a855f7)",
    "linear-gradient(90deg, #ef4444, #f59e0b)",
  ];

  container.innerHTML = departments
    .map(
      (dept, i) => `
    <div class="dept-row">
      <div class="dept-info">
        <span class="dept-name">${dept.name}</span>
        <span class="dept-meta"><strong>${dept.count}</strong> employees &nbsp;|&nbsp; Rating: <strong>${dept.avg_performance}</strong> &nbsp;|&nbsp; Avg. Salary: <strong>Rs ${Math.round(dept.avg_salary / 1000)}k</strong></span>
      </div>
      <div class="dept-bar-outer">
        <div class="dept-bar-inner" style="width: 0%; background: ${deptColors[i % deptColors.length]};" data-target="${(dept.count / maxCount) * 100}"></div>
      </div>
    </div>
  `
    )
    .join("");

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll(".dept-bar-inner").forEach((bar) => {
      bar.style.width = bar.dataset.target + "%";
    });
  }, 200);
}

// Render manager rating histogram bars
function renderManagerBars(managerRatings) {
  const container = document.getElementById("manager-bars-container");
  if (!managerRatings) return;

  const maxVal = Math.max(...Object.values(managerRatings));
  const labels = { 1: "1★", 2: "2★", 3: "3★", 4: "4★", 5: "5★" };

  container.innerHTML = Object.entries(managerRatings)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(
      ([rating, count]) => `
    <div class="manager-column">
      <div class="manager-bar-fill" style="height: 0px;" 
           data-target="${Math.max(6, (count / maxVal) * 65)}">
        <span class="manager-val-pop">${count}</span>
      </div>
      <span class="manager-label">${labels[rating] || rating}</span>
    </div>
  `
    )
    .join("");

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll(".manager-bar-fill").forEach((bar) => {
      bar.style.height = bar.dataset.target + "px";
    });
  }, 300);
}

// ─── Analytics: Category Tabs ──────────────────────────
function switchAnalyticsCategory(category) {
  // Update tab buttons
  document.querySelectorAll(".analytics-tab").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.currentTarget.classList.add("active");

  // Update galleries
  document.querySelectorAll(".analytics-gallery").forEach((gallery) => {
    gallery.classList.remove("active");
  });
  document.getElementById(`analytics-cat-${category}`).classList.add("active");
}

// Plot Modal
function openPlotModal(imgSrc, title, description) {
  document.getElementById("modal-plot-img").src = imgSrc;
  document.getElementById("modal-plot-title").textContent = title;
  document.getElementById("modal-plot-desc").textContent = description;
  document.getElementById("plot-modal").classList.add("active");
  document.body.style.overflow = "hidden";
}

function closePlotModal() {
  document.getElementById("plot-modal").classList.remove("active");
  document.body.style.overflow = "";
}

// ─── Predictor: Model Selection ───────────────────────
function selectModel(radioInput) {
  // Remove active class from all model labels
  document.querySelectorAll('.model-radio-item').forEach(el => el.classList.remove('active'));
  // Add active class to the clicked label
  radioInput.closest('.model-radio-item').classList.add('active');
}

function getSelectedModel() {
  const checked = document.querySelector('input[name="model-choice"]:checked');
  return checked ? checked.value : 'random_forest';
}

// ─── Predictor: Template Presets ──────────────────────
function applyPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;

  document.getElementById("input-age").value = p.age;
  document.getElementById("input-gender").value = p.gender;
  document.getElementById("input-department").value = p.department;
  document.getElementById("input-experience").value = p.experience;
  document.getElementById("input-projects").value = p.projects;
  document.getElementById("input-overtime").value = p.overtime;
  document.getElementById("input-manager").value = p.manager;
  document.getElementById("input-promotion").value = p.promotion;

  // Sliders
  document.getElementById("input-salary").value = p.salary;
  updateSliderVal("salary", p.salary);

  document.getElementById("input-attendance").value = p.attendance;
  updateSliderVal("attendance", p.attendance);

  document.getElementById("input-training").value = p.training;
  updateSliderVal("training", p.training);

  // Animate preset button briefly
  document
    .querySelectorAll(".preset-btn")
    .forEach((b) => b.classList.remove("active-preset"));
}

// ─── Predictor: Run Prediction ─────────────────────────
async function runPrediction(event) {
  event.preventDefault();
  const btn = document.querySelector(".predict-btn");
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Simulating...';
  btn.disabled = true;

  try {
    const payload = {
      model: getSelectedModel(),
      Age: parseInt(document.getElementById("input-age").value),
      Gender: document.getElementById("input-gender").value,
      Department: document.getElementById("input-department").value,
      Experience: parseInt(document.getElementById("input-experience").value),
      Salary: parseFloat(document.getElementById("input-salary").value),
      "Attendance Percentage": parseFloat(
        document.getElementById("input-attendance").value
      ),
      "Training Hours": parseInt(
        document.getElementById("input-training").value
      ),
      "Projects Completed": parseInt(
        document.getElementById("input-projects").value
      ),
      "Overtime Hours": parseInt(
        document.getElementById("input-overtime").value
      ),
      "Manager Rating": parseInt(
        document.getElementById("input-manager").value
      ),
      "Promotion Status": parseInt(
        document.getElementById("input-promotion").value
      ),
    };

    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Prediction API error");
    const data = await res.json();

    displayPredictionResult(data);
  } catch (err) {
    console.error("Prediction failed:", err);
    alert("Prediction failed. Please check your inputs and try again.");
  } finally {
    btn.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles"></i> Run Prediction Simulation';
    btn.disabled = false;
  }
}

function displayPredictionResult(data) {
  const panel = document.getElementById("prediction-result-panel");
  const placeholder = panel.querySelector(".result-placeholder");
  const content = panel.querySelector(".result-content");

  // Show content, hide placeholder
  placeholder.style.display = "none";
  content.style.display = "flex";
  panel.classList.remove("empty");

  const rating = data.predicted_rating;

  // Set tier badge
  let tierText, tierColor;
  if (rating >= 4.5) {
    tierText = "Exceptional Performer";
    tierColor = "#f59e0b";
  } else if (rating >= 4.0) {
    tierText = "High Performer";
    tierColor = "#10b981";
  } else if (rating >= 3.5) {
    tierText = "Solid Contributor";
    tierColor = "#6366f1";
  } else if (rating >= 3.0) {
    tierText = "Average Performer";
    tierColor = "#3b82f6";
  } else {
    tierText = "Needs Improvement";
    tierColor = "#ef4444";
  }

  const badge = document.getElementById("result-tier");
  badge.textContent = tierText;
  badge.style.borderColor = tierColor;
  badge.style.color = tierColor;
  badge.style.background = `${tierColor}18`;

  // Animate gauge
  document.getElementById("result-rating").textContent = rating.toFixed(2);
  const gaugeEl = document.getElementById("gauge-fill-circle");
  const circumference = 2 * Math.PI * 40; // r=40
  const pct = rating / 5;
  const dashOffset = circumference * (1 - pct);
  gaugeEl.style.stroke = tierColor;
  gaugeEl.style.filter = `drop-shadow(0 0 8px ${tierColor}88)`;

  setTimeout(() => {
    gaugeEl.style.strokeDasharray = circumference;
    gaugeEl.style.strokeDashoffset = dashOffset;
  }, 100);

  // Fill model used
  const modelUsedEl = document.getElementById("result-model-used");
  if (modelUsedEl) modelUsedEl.textContent = data.model_used || '—';

  // Fill comparison stats
  const diff = data.difference_from_average;
  const diffEl = document.getElementById("result-diff");
  diffEl.textContent = `${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`;
  diffEl.style.color = diff >= 0 ? "#10b981" : "#ef4444";

  document.getElementById(
    "result-percentile"
  ).textContent = `${data.percentile}th percentile`;

  // Render insights
  const list = document.getElementById("result-insights-list");
  list.innerHTML = data.insights.map((insight) => `<li>${insight}</li>`).join("");
}

// ─── Directory: Search & Load ──────────────────────────
function handleDirectorySearch() {
  clearTimeout(dirSearchTimeout);
  dirSearchTimeout = setTimeout(() => {
    currentPage = 1;
    loadDirectory();
  }, 400);
}

async function loadDirectory() {
  const search = document.getElementById("dir-search").value.trim();
  const department = document.getElementById("dir-filter-dept").value;
  const gender = document.getElementById("dir-filter-gender").value;

  const params = new URLSearchParams({
    page: currentPage,
    limit: PAGE_LIMIT,
    search,
    department,
    gender,
  });

  const tbody = document.getElementById("directory-table-body");
  tbody.innerHTML = `
    <tr>
      <td colspan="13" style="text-align:center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--accent-indigo); font-size: 1.2rem;"></i>
        &nbsp; Loading records...
      </td>
    </tr>`;

  try {
    const res = await fetch(`/api/employees?${params}`);
    if (!res.ok) throw new Error("Employees API error");
    const data = await res.json();

    renderDirectoryTable(data.employees);
    renderPagination(data.page, data.pages, data.total);
  } catch (err) {
    console.error("Directory load failed:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align:center; color: var(--accent-danger); padding: 2rem;">
          Failed to load employee records.
        </td>
      </tr>`;
  }
}

function renderDirectoryTable(employees) {
  const tbody = document.getElementById("directory-table-body");

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 1.5rem; display: block; margin-bottom: 0.5rem; opacity: 0.3;"></i>
          No employees found matching your search criteria.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = employees
    .map((emp) => {
      const perf = parseFloat(emp["Performance Rating"]);
      const perfClass = perf >= 4.5 ? "high" : perf >= 3.5 ? "medium" : "low";
      const promotionBadge =
        emp["Promotion Status"] === 1
          ? '<span class="badge badge-success">Promoted</span>'
          : '<span style="color: var(--text-muted); font-size: 0.75rem;">—</span>';

      return `
        <tr>
          <td style="font-weight: 600; font-family: monospace; color: var(--accent-indigo);">${emp["Employee ID"]}</td>
          <td>${emp["Age"]}</td>
          <td>${emp["Gender"]}</td>
          <td>${emp["Department"]}</td>
          <td>${emp["Experience"]}y</td>
          <td>Rs ${parseInt(emp["Salary"]).toLocaleString('en-IN')}</td>
          <td>${emp["Attendance Percentage"]}%</td>
          <td>${emp["Training Hours"]}h</td>
          <td>${emp["Projects Completed"]}</td>
          <td>${emp["Overtime Hours"]}h</td>
          <td>${emp["Manager Rating"]}/5</td>
          <td><span class="perf-rating-badge ${perfClass}">${perf.toFixed(2)}</span></td>
          <td>${promotionBadge}</td>
        </tr>`;
    })
    .join("");
}

function renderPagination(page, totalPages, totalRecords) {
  const start = (page - 1) * PAGE_LIMIT + 1;
  const end = Math.min(page * PAGE_LIMIT, totalRecords);

  document.getElementById("pag-start").textContent =
    totalRecords > 0 ? start : 0;
  document.getElementById("pag-end").textContent = end;
  document.getElementById("pag-total").textContent =
    totalRecords.toLocaleString();

  const prevBtn = document.getElementById("pag-prev");
  const nextBtn = document.getElementById("pag-next");
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;

  // Render page number buttons (show up to 7 pages)
  const pagesContainer = document.getElementById("pag-pages-container");
  pagesContainer.innerHTML = "";

  let startPage = Math.max(1, page - 3);
  let endPage = Math.min(totalPages, startPage + 6);
  if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

  for (let p = startPage; p <= endPage; p++) {
    const btn = document.createElement("button");
    btn.className = `pag-num${p === page ? " active" : ""}`;
    btn.textContent = p;
    btn.onclick = (() => {
      const pg = p;
      return () => goToPage(pg);
    })();
    pagesContainer.appendChild(btn);
  }
}

function goToPage(page) {
  currentPage = page;
  loadDirectory();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    loadDirectory();
  }
}

function nextPage() {
  currentPage++;
  loadDirectory();
}

// ─── Date Display ──────────────────────────────────────
function updateDate() {
  const now = new Date();
  const opts = { year: "numeric", month: "long", day: "numeric" };
  const dateStr = now.toLocaleDateString("en-US", opts);
  const el = document.getElementById("current-date");
  if (el) el.textContent = dateStr;
}

// ─── Keyboard Shortcuts ────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePlotModal();
});

// ─── Init: Bootstrap on DOM Ready ────────────────────
document.addEventListener("DOMContentLoaded", () => {
  updateDate();
  loadDashboardStats();
});
