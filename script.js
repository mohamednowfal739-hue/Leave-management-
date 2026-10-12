const TOTALS = { Casual: 12, Medical: 10 };
let employee = { name: "", id: "" };
let requests = [];
let activeView = "overview";
let activeFilter = "All";
let toastTimer;

const $ = id => document.getElementById(id);
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const safeText = value => String(value).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const dayCount = (from, to) => Math.round((new Date(to + "T00:00:00") - new Date(from + "T00:00:00")) / 86400000) + 1;
const fmtDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"});
const shortDateRange = r => `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
const usedDays = type => requests.filter(r => r.type === type && r.status !== "Rejected").reduce((n,r) => n + r.days, 0);
const balance = type => TOTALS[type] - usedDays(type);

function notify(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800);
}

function showView(view) {
  activeView = view;
  ["overview","apply","history"].forEach(v => $(v + "View").classList.toggle("hidden", v !== view));
  document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const labels = {overview:"Overview",apply:"Apply for leave",history:"Leave history"};
  $("breadcrumbCurrent").textContent = labels[view];
  $("sidebar").classList.remove("open");
  if (view === "apply") updateFormBalances();
  if (view === "history") renderHistory();
  window.scrollTo({top:0,behavior:"smooth"});
}

$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  employee.name = $("employeeName").value.trim();
  employee.id = $("employeeId").value.trim() || "Employee";
  if (!employee.name) return;
  $("loginScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  const first = employee.name.split(/\s+/)[0];
  $("sidebarName").textContent = employee.name;
  $("sidebarId").textContent = employee.id;
  $("sidebarAvatar").textContent = first.charAt(0).toUpperCase();
  $("topAvatar").textContent = first.charAt(0).toUpperCase();
  const hour = new Date().getHours();
  $("greeting").innerHTML = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${safeText(first)} <span>✦</span>`;
  renderAll();
  notify(`Welcome to LeaveEase, ${first}.`);
});

$("logoutButton").addEventListener("click", () => {
  employee = {name:"",id:""};
  $("appScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("employeeName").value = "";
  $("employeeId").value = "";
  $("sidebar").classList.remove("open");
});
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showView(b.dataset.go)));
["newLeaveButton","balanceApplyButton","historyNewButton"].forEach(id => $(id).addEventListener("click", () => showView("apply")));
$("cancelFormButton").addEventListener("click", () => { $("leaveForm").reset(); updateTypeCards(); clearFormMessage(); showView("overview"); });
$("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("helpButton").addEventListener("click", () => $("helpModal").classList.remove("hidden"));
["closeHelp","gotItButton"].forEach(id => $(id).addEventListener("click", () => $("helpModal").classList.add("hidden")));
$("helpModal").addEventListener("click", e => { if (e.target === $("helpModal")) $("helpModal").classList.add("hidden"); });

$("fromDate").min = todayISO();
$("toDate").min = todayISO();
$("fromDate").addEventListener("change", () => {
  $("toDate").min = $("fromDate").value || todayISO();
  if ($("toDate").value && $("toDate").value < $("fromDate").value) $("toDate").value = $("fromDate").value;
});
document.querySelectorAll('input[name="leaveType"]').forEach(r => r.addEventListener("change", updateTypeCards));
$("leaveReason").addEventListener("input", () => $("charCount").textContent = `${$("leaveReason").value.length} / 400`);

function updateTypeCards() {
  const type = document.querySelector('input[name="leaveType"]:checked').value;
  $("casualOption").classList.toggle("selected", type === "Casual");
  $("medicalOption").classList.toggle("selected", type === "Medical");
}
function updateFormBalances() {
  $("formCasualBalance").textContent = `${balance("Casual")} days`;
  $("formMedicalBalance").textContent = `${balance("Medical")} days`;
}
function showFormMessage(message, kind="error") {
  $("formMessage").textContent = message;
  $("formMessage").className = `form-message ${kind}`;
}
function clearFormMessage() {
  $("formMessage").textContent = "";
  $("formMessage").className = "form-message hidden";
}

$("leaveForm").addEventListener("submit", e => {
  e.preventDefault();
  const type = document.querySelector('input[name="leaveType"]:checked').value;
  const from = $("fromDate").value;
  const to = $("toDate").value;
  const reason = $("leaveReason").value.trim();
  if (!from || !to || !reason) return showFormMessage("Please complete all required fields.");
  if (from < todayISO()) return showFormMessage("The start date cannot be in the past.");
  if (to < from) return showFormMessage("The end date must be on or after the start date.");
  const days = dayCount(from,to);
  if (days > balance(type)) return showFormMessage(`You have ${balance(type)} ${type.toLowerCase()} leave days available, but selected ${days} days.`);
  const overlap = requests.some(r => r.status !== "Rejected" && from <= r.to && to >= r.from);
  if (overlap) return showFormMessage("These dates overlap another pending or approved request.");
  requests.unshift({id:Date.now(),type,from,to,days,reason,status:"Pending",created:todayISO()});
  $("leaveForm").reset();
  $("fromDate").min = todayISO();
  $("toDate").min = todayISO();
  $("charCount").textContent = "0 / 400";
  updateTypeCards();
  clearFormMessage();
  renderAll();
  showFormMessage("Your leave request has been submitted successfully.", "success");
  notify("Leave request submitted.");
  window.setTimeout(() => showView("history"), 700);
});

function cancelRequest(id) {
  const request = requests.find(r => r.id === id);
  if (!request || request.status !== "Pending") return;
  requests = requests.filter(r => r.id !== id);
  renderAll();
  notify("Pending leave request cancelled. Your balance has been restored.");
}

function renderOverview() {
  for (const type of ["Casual","Medical"]) {
    const remaining = balance(type);
    const used = usedDays(type);
    const prefix = type.toLowerCase();
    $(`${prefix}Balance`).innerHTML = `${remaining} <small>days left</small>`;
    $(`${prefix}Used`).textContent = `${used} ${used === 1 ? "day" : "days"} reserved`;
    $(`${prefix}Progress`).style.width = `${Math.min(100, used / TOTALS[type] * 100)}%`;
    $(`${prefix}Summary`).textContent = `${remaining} / ${TOTALS[type]} days`;
  }
  $("pendingCount").innerHTML = `${requests.filter(r=>r.status==="Pending").length} <small>requests</small>`;
  $("approvedCount").innerHTML = `${requests.filter(r=>r.status==="Approved").length} <small>requests</small>`;
  const recent = requests.slice(0,4);
  $("recentRequests").innerHTML = recent.length ? recent.map(r => `
    <div class="recent-item">
      <span class="leave-mini-icon ${r.type==="Casual"?"mini-blue":"mini-green"}">${r.type==="Casual"?"☀":"✚"}</span>
      <div class="recent-info"><strong>${r.type} leave</strong><small>${safeText(shortDateRange(r))} · ${r.days} ${r.days===1?"day":"days"}</small></div>
      <span class="status-pill status-${r.status.toLowerCase()}">${r.status}</span>
    </div>`).join("") : `<div class="empty-state"><span class="empty-icon">◷</span><strong>No requests yet</strong><p>Your leave applications will appear here.</p></div>`;
  updateFormBalances();
}
function renderHistory() {
  const query = $("historySearch").value.trim().toLowerCase();
  const filtered = requests.filter(r => (activeFilter==="All" || r.status===activeFilter) && `${r.reason} ${r.type}`.toLowerCase().includes(query));
  $("allFilterCount").textContent = requests.length;
  $("historyTable").innerHTML = filtered.map(r => `
    <tr>
      <td>${r.type} leave</td>
      <td>${safeText(shortDateRange(r))}</td>
      <td>${r.days} ${r.days===1?"day":"days"}</td>
      <td class="reason-cell" title="${safeText(r.reason)}">${safeText(r.reason)}</td>
      <td><span class="status-pill status-${r.status.toLowerCase()}">${r.status}</span></td>
      <td>${r.status==="Pending"?`<button class="table-action" data-cancel="${r.id}">Cancel</button>`:"—"}</td>
    </tr>`).join("");
  $("historyEmpty").classList.toggle("hidden", filtered.length !== 0);
  $("historyTable").classList.toggle("hidden", filtered.length === 0);
  document.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => cancelRequest(Number(b.dataset.cancel))));
}
function renderAll() { renderOverview(); renderHistory(); }
document.querySelectorAll("[data-filter]").forEach(b => b.addEventListener("click", () => {
  activeFilter = b.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(t => t.classList.toggle("active", t===b));
  renderHistory();
}));
$("historySearch").addEventListener("input", renderHistory);

// Demo-only: application data is held in memory and resets on refresh.
renderAll();
