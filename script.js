"use strict";

const STORAGE_KEY = "productivityAI_dashboard_v1";

const $ = (selector) => document.querySelector(selector);

const makeId = () =>
  window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const initialData = () => ({
  tasks: [],
  goals: [],
  focusMinutes: 0,
  sessions: 0,
  completedByDay: {},
  focusByDay: {},
  theme: "dark"
});

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed &&
        Array.isArray(parsed.tasks) &&
        Array.isArray(parsed.goals)
      ) {
        return { ...initialData(), ...parsed };
      }
    }
  } catch (error) {
    console.error("Could not load saved data:", error);
  }

  return initialData();
}

let data = loadData();
let editingTaskId = null;
let timerLength = 25;
let secondsLeft = 25 * 60;
let timerInterval = null;
let timerRunning = false;
let charts = {};
let toastTimeout;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Could not save dashboard data:", error);
    toast("Could not save data. Check your browser storage.");
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    element.classList.remove("show");
  }, 2500);
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  if (pageId === "dashboard" || pageId === "analytics") {
    renderCharts();
  }

  if (pageId === "dashboard") {
    renderDashboardTasks();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function completedTasks() {
  return data.tasks.filter((task) => task.done).length;
}

function completionRate() {
  return data.tasks.length
    ? Math.round((completedTasks() / data.tasks.length) * 100)
    : 0;
}

function renderStats() {
  $("#completedCount").textContent = completedTasks();
  $("#completionRate").textContent = completionRate() + "%";
  $("#activeGoals").textContent = data.goals.filter(
    (goal) => goal.progress < goal.target
  ).length;
  $("#focusMinutes").textContent = data.focusMinutes;

  $("#goalTotal").textContent = data.goals.length;
  $("#goalCompleted").textContent = data.goals.filter(
    (goal) => goal.progress >= goal.target
  ).length;

  $("#totalTasksAnalytics").textContent = data.tasks.length;
  $("#doneTasksAnalytics").textContent = completedTasks();
  $("#analyticsSessions").textContent = data.sessions;
  $("#sessionCount").textContent = data.sessions;
}

function formatDate(dateString) {
  if (!dateString) return "No due date";

  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function taskMarkup(task) {
  const detail = [
    task.details,
    task.due ? "Due " + formatDate(task.due) : ""
  ].filter(Boolean).join(" · ");

  return `
    <div class="task-item ${task.done ? "completed" : ""}">
      <input
        type="checkbox"
        ${task.done ? "checked" : ""}
        onchange="toggleTask('${task.id}')"
        aria-label="Complete task"
      >

      <div class="task-info">
        <strong>${escapeHTML(task.title)}</strong>
        <small>${escapeHTML(detail || "No additional details")}</small>
      </div>

      <span class="priority ${escapeHTML(task.priority)}">
        ${escapeHTML(task.priority)}
      </span>

      <button class="delete-button"
        onclick="editTask('${task.id}')"
        title="Edit task">✎</button>

      <button class="delete-button"
        onclick="deleteTask('${task.id}')"
        title="Delete task">×</button>
    </div>
  `;
}

function renderDashboardTasks() {
  const tasks = [...data.tasks]
    .filter((task) => !task.done)
    .slice(0, 5);

  $("#dashboardTasks").innerHTML = tasks.length
    ? tasks.map(taskMarkup).join("")
    : `<p class="muted">No pending tasks. Add one when you're ready!</p>`;
}

function renderTasks() {
  const search = ($("#taskSearch")?.value || "").toLowerCase().trim();
  const filter = $("#taskFilter")?.value || "all";

  const tasks = data.tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(search) ||
      (task.details || "").toLowerCase().includes(search);

    const matchesFilter =
      filter === "all" ||
      (filter === "pending" && !task.done) ||
      (filter === "completed" && task.done);

    return matchesSearch && matchesFilter;
  });

  $("#allTasks").innerHTML = tasks.length
    ? tasks.map(taskMarkup).join("")
    : `<p class="muted">No tasks found. Add a task or change your search.</p>`;
}

function renderGoals() {
  $("#goalList").innerHTML = data.goals.length
    ? data.goals.map((goal) => {
        const percentage = Math.min(
          100,
          Math.round((goal.progress / goal.target) * 100)
        );

        return `
          <article class="goal-card">
            <span class="eyebrow">${escapeHTML(goal.category)}</span>
            <h3>${escapeHTML(goal.title)}</h3>
            <p>
              ${goal.progress >= goal.target
                ? "🎉 Goal completed! Well done."
                : `${goal.progress} of ${goal.target} milestones completed.`}
            </p>

            <div class="progress-track">
              <div class="progress-fill" style="width:${percentage}%"></div>
            </div>

            <p>${percentage}% complete</p>

            <div class="goal-actions">
              <button onclick="advanceGoal('${goal.id}')"
                ${goal.progress >= goal.target ? "disabled" : ""}>
                + Milestone
              </button>

              <button onclick="undoGoal('${goal.id}')"
                ${goal.progress <= 0 ? "disabled" : ""}>
                − Undo
              </button>

              <button onclick="deleteGoal('${goal.id}')">Delete</button>
            </div>
          </article>
        `;
      }).join("")
    : `<div class="card"><p>No goals yet. Click “Add Goal” to create your first goal.</p></div>`;
}

function renderAll() {
  renderStats();
  renderDashboardTasks();
  renderTasks();
  renderGoals();
  generateRecommendation();
  updateTimerDisplay();

  if (typeof Chart !== "undefined") {
    renderCharts();
  }
}

function openTaskForm(taskId = null) {
  editingTaskId = taskId;

  const form = $("#taskForm");
  form.reset();

  const task = taskId
    ? data.tasks.find((item) => item.id === taskId)
    : null;

  $("#formTitle").textContent = task ? "Edit Task" : "Create a Task";
  $("#taskTitle").value = task?.title || "";
  $("#taskDetails").value = task?.details || "";
  $("#taskPriority").value = task?.priority || "Medium";
  $("#taskDue").value = task?.due || "";

  $("#taskModal").classList.add("open");
  $("#taskTitle").focus();
}

function closeTaskForm() {
  $("#taskModal").classList.remove("open");
}

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const title = $("#taskTitle").value.trim();

  if (!title) {
    toast("Please enter a task name.");
    return;
  }

  const values = {
    title,
    details: $("#taskDetails").value.trim(),
    priority: $("#taskPriority").value,
    due: $("#taskDue").value
  };

  if (editingTaskId) {
    const task = data.tasks.find((item) => item.id === editingTaskId);
    if (task) Object.assign(task, values);
    toast("Task updated successfully!");
  } else {
    data.tasks.unshift({
      id: makeId(),
      ...values,
      done: false,
      created: Date.now()
    });
    toast("Task added. You've got this!");
  }

  saveData();
  closeTaskForm();
  renderAll();
});

function toggleTask(id) {
  const task = data.tasks.find((item) => item.id === id);
  if (!task) return;

  task.done = !task.done;

  if (task.done) {
    task.completedAt = today();
    data.completedByDay[today()] =
      (data.completedByDay[today()] || 0) + 1;
    toast("Task completed. Nice work! ✨");
  } else {
    delete task.completedAt;
    data.completedByDay[today()] = Math.max(
      0,
      (data.completedByDay[today()] || 0) - 1
    );
    toast("Task moved back to pending.");
  }

  saveData();
  renderAll();
}

function editTask(id) {
  openTaskForm(id);
}

function deleteTask(id) {
  const task = data.tasks.find((item) => item.id === id);
  if (!task) return;

  if (!confirm(`Delete "${task.title}"?`)) return;

  data.tasks = data.tasks.filter((item) => item.id !== id);
  saveData();
  renderAll();
  toast("Task deleted.");
}

function addGoal() {
  const title = prompt("Enter your goal name:");

  if (title === null) return;

  if (!title.trim()) {
    toast("Please enter a goal name.");
    return;
  }

  const category = prompt(
    "Enter a category: Learning, Career, Project, Health or Personal",
    "Learning"
  );

  if (category === null) return;

  const targetText = prompt("How many milestones are needed?", "5");

  if (targetText === null) return;

  const target = Number(targetText);

  if (!Number.isInteger(target) || target < 1 || target > 100) {
    toast("Enter a whole number between 1 and 100.");
    return;
  }

  data.goals.push({
    id: makeId(),
    title: title.trim(),
    category: category.trim() || "Personal",
    target,
    progress: 0
  });

  saveData();
  renderAll();
  toast("Goal added. Keep going! 🎯");
}

function advanceGoal(id) {
  const goal = data.goals.find((item) => item.id === id);
  if (!goal || goal.progress >= goal.target) return;

  goal.progress++;
  saveData();
  renderAll();

  toast(goal.progress >= goal.target
    ? "Goal completed! Amazing work!"
    : "Milestone added!");
}

function undoGoal(id) {
  const goal = data.goals.find((item) => item.id === id);
  if (!goal || goal.progress <= 0) return;

  goal.progress--;
  saveData();
  renderAll();
}

function deleteGoal(id) {
  const goal = data.goals.find((item) => item.id === id);
  if (!goal) return;

  if (!confirm(`Delete goal "${goal.title}"?`)) return;

  data.goals = data.goals.filter((item) => item.id !== id);
  saveData();
  renderAll();
  toast("Goal deleted.");
}

function generateRecommendation() {
  if (!$("#recommendation")) return;

  const pending = data.tasks.filter((task) => !task.done);
  const highPriority = pending.find((task) => task.priority === "High");
  const unfinishedGoal = data.goals.find(
    (goal) => goal.progress < goal.target
  );

  let suggestion;

  if (highPriority) {
    suggestion = `🎯 <strong>Start with your high-priority task.</strong><br>
      Try working on “${escapeHTML(highPriority.title)}” for one focused session.`;
  } else if (pending.length >= 5) {
    suggestion = `✨ <strong>Try the three-task rule.</strong><br>
      Choose your three most important tasks and work through them one at a time.`;
  } else if (unfinishedGoal) {
    suggestion = `🚀 <strong>Move one goal forward.</strong><br>
      Your goal “${escapeHTML(unfinishedGoal.title)}” is waiting for its next milestone.`;
  } else if (pending.length > 0) {
    suggestion = `⏱ <strong>Try a 25-minute focus session.</strong><br>
      Choose one pending task, silence distractions and get started.`;
  } else {
    suggestion = `🌟 <strong>You're ready for your next small win.</strong><br>
      Add a task when you're ready, or take a well-earned break.`;
  }

  $("#recommendation").innerHTML = suggestion;
}

function getLastSevenDays() {
  const result = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);

    const key =
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    result.push({
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" })
    });
  }

  return result;
}

function renderCharts() {
  if (typeof Chart === "undefined") return;

  Object.values(charts).forEach((chart) => chart.destroy());
  charts = {};

  const days = getLastSevenDays();
  const labels = days.map((day) => day.label);
  const values = days.map(
    (day) => data.completedByDay[day.key] || 0
  );

  const textColor = getComputedStyle(document.body)
    .getPropertyValue("--muted").trim() || "#aaa5c8";

  const borderColor = getComputedStyle(document.body)
    .getPropertyValue("--border").trim() || "#383257";

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: { color: textColor },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: textColor, precision: 0 },
        grid: { color: borderColor }
      }
    }
  };

  ["weeklyChart", "analyticsChart"].forEach((id) => {
    const canvas = $("#" + id);
    if (!canvas) return;

    charts[id] = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Completed tasks",
          data: values,
          backgroundColor: "#9575ff",
          hoverBackgroundColor: "#639cff",
          borderRadius: 7,
          maxBarThickness: 32
        }]
      },
      options: barOptions
    });
  });

  const statusCanvas = $("#statusChart");

  if (statusCanvas) {
    charts.statusChart = new Chart(statusCanvas, {
      type: "doughnut",
      data: {
        labels: ["Completed", "Pending"],
        datasets: [{
          data: [
            completedTasks(),
            data.tasks.length - completedTasks()
          ],
          backgroundColor: ["#a184ff", "#639cff"],
          borderWidth: 3,
          borderColor: getComputedStyle(document.body)
            .getPropertyValue("--card").trim() || "#1b1838"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: textColor,
              padding: 18,
              usePointStyle: true
            }
          }
        }
      }
    });
  }
}

function updateTimerDisplay() {
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const time = `${minutes}:${seconds}`;

  $("#miniTimer").textContent = time;
  $("#bigTimer").textContent = time;

  $("#timerStatus").textContent = timerRunning
    ? "Focus session in progress. Keep going!"
    : "Ready when you are.";
}

function startTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning = false;
    updateTimerDisplay();
    toast("Timer paused.");
    return;
  }

  if (secondsLeft <= 0) {
    secondsLeft = timerLength * 60;
  }

  timerRunning = true;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();

    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerRunning = false;

      if (timerLength === 25) {
        data.sessions++;
        data.focusMinutes += 25;
        data.focusByDay[today()] =
          (data.focusByDay[today()] || 0) + 25;

        saveData();
        renderStats();
        renderCharts();

        toast("Focus session complete! Take a break. 🎉");
      } else {
        toast("Break finished. Ready to focus again?");
      }

      updateTimerDisplay();
    }
  }, 1000);
}

function setTimer(minutes) {
  if (timerRunning) {
    toast("Pause the timer before changing the session.");
    return;
  }

  timerLength = minutes;
  secondsLeft = minutes * 60;
  updateTimerDisplay();
}

function resetTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = null;
  timerRunning = false;
  secondsLeft = timerLength * 60;
  updateTimerDisplay();
}

function toggleTheme() {
  data.theme = data.theme === "light" ? "dark" : "light";
  document.body.classList.toggle("light", data.theme === "light");

  saveData();

  Object.values(charts).forEach((chart) => chart.destroy());
  charts = {};
  renderCharts();
}

function exportTasks() {
  const rows = [
    ["Task", "Details", "Priority", "Due Date", "Status"],
    ...data.tasks.map((task) => [
      task.title,
      task.details,
      task.priority,
      task.due,
      task.done ? "Completed" : "Pending"
    ])
  ];

  const csv = rows.map((row) =>
    row.map((value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(",")
  ).join("\r\n");

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "productivity-ai-tasks.csv";
  link.click();

  URL.revokeObjectURL(url);
  toast("Tasks exported as CSV.");
}

$("#taskModal").addEventListener("click", (event) => {
  if (event.target.id === "taskModal") closeTaskForm();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTaskForm();
});

const now = new Date();

$("#todayDate").textContent = now.toLocaleDateString(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric"
});

const hour = now.getHours();

$("#greeting").textContent =
  (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening") +
  "! ✨";

document.body.classList.toggle("light", data.theme === "light");

renderAll();
