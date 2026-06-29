/* =========================================================
   TeamPulse dashboard
   - Reads board list-movement history (Trello action log)
   - Computes time each card spent in the "In Progress" list(s)
   - Compares actual vs estimate (custom field) and vs due date
   - No server: everything is computed in-browser on open
   ========================================================= */
var APP_KEY = "7afe3089ed59ea88b6442475d66909f4";
var API = "https://api.trello.com/1";

var t = window.TrelloPowerUp.iframe({ appKey: APP_KEY, appName: "TeamPulse" });

var PALETTE = ["#1a73e8", "#1e8e3e", "#f9ab00", "#9334e6", "#e8710a", "#12b5cb", "#d93025", "#3949ab"];
var C = { blue:"#1a73e8", green:"#1e8e3e", amber:"#f9ab00", red:"#d93025", ink:"#202124", sub:"#5f6368", line:"#dadce0", faint:"#e8eaed" };

var DEFAULTS = {
  inProgressListIds: [],
  doneListIds: [],
  estimateFieldName: "Estimate (hrs)",
  workHoursOnly: true,
  workDays: [0, 1, 2, 3, 4],   // Sun..Thu
  dayStart: 9,
  dayEnd: 18,
};

var STATE = { member: "all", range: 30 };
var DATA = null;       // computed model
var CHARTS = {};

/* ---------- helpers ---------- */
function hrs(ms) { return Math.round((ms / 3600000) * 10) / 10; }
function firstName(n) { return (n || "?").split(" ")[0]; }
function colorFor(i) { return PALETTE[i % PALETTE.length]; }

/* working-time-aware duration between two epoch ms */
function effectiveMs(start, end, cfg) {
  if (end <= start) return 0;
  if (!cfg.workHoursOnly) return end - start;
  var total = 0;
  var cur = new Date(start); cur.setHours(0, 0, 0, 0);
  while (cur.getTime() < end) {
    if (cfg.workDays.indexOf(cur.getDay()) !== -1) {
      var ws = new Date(cur); ws.setHours(cfg.dayStart, 0, 0, 0);
      var we = new Date(cur); we.setHours(cfg.dayEnd, 0, 0, 0);
      var a = Math.max(start, ws.getTime());
      var b = Math.min(end, we.getTime());
      if (b > a) total += b - a;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

/* ---------- REST: pull every list-move / create action on the board ---------- */
async function fetchMoveActions(boardId, token) {
  var out = [], before = "", page;
  do {
    var url = API + "/boards/" + boardId + "/actions?filter=createCard,copyCard,updateCard" +
      "&limit=1000&fields=type,date,data" + (before ? "&before=" + before : "") +
      "&key=" + APP_KEY + "&token=" + token;
    var res = await fetch(url);
    if (!res.ok) throw new Error("Trello API " + res.status);
    page = await res.json();
    out = out.concat(page);
    if (page.length) before = page[page.length - 1].id;
  } while (page.length === 1000);
  return out;
}

async function fetchCustomFields(boardId, token) {
  var url = API + "/boards/" + boardId + "/customFields?key=" + APP_KEY + "&token=" + token;
  var res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

/* ---------- build the analytics model ---------- */
async function build(cfg) {
  var board = await t.board("id", "name", "members");
  var lists = await t.lists("id", "name");
  var token = await t.getRestApi().getToken();
  var cardsRes = await fetch(API + "/boards/" + board.id +
    "/cards?fields=id,name,idList,idMembers,due&customFieldItems=true&key=" + APP_KEY + "&token=" + token);
  if (!cardsRes.ok) throw new Error("Cards API " + cardsRes.status);
  var cards = await cardsRes.json();

  var inProg = {}, done = {};
  cfg.inProgressListIds.forEach(function (id) { inProg[id] = true; });
  cfg.doneListIds.forEach(function (id) { done[id] = true; });

  var actions = await fetchMoveActions(board.id, token);

  // estimate custom field lookup
  var estFieldId = null;
  var cfFields = await fetchCustomFields(board.id, token);
  cfFields.forEach(function (f) {
    if (f.name && f.name.toLowerCase() === cfg.estimateFieldName.toLowerCase()) estFieldId = f.id;
  });

  // group movement events per card (ascending)
  var byCard = {};
  actions.slice().reverse().forEach(function (a) {
    var cid = a.data && a.data.card && a.data.card.id;
    if (!cid) return;
    (byCard[cid] = byCard[cid] || []).push(a);
  });

  var memberName = {};
  (board.members || []).forEach(function (m) { memberName[m.id] = m.fullName || m.username; });

  var now = Date.now();
  var tasks = cards.map(function (c) {
    var evs = byCard[c.id] || [];
    var curList = null, curSince = null, inProgMs = 0, doneAt = null;

    evs.forEach(function (a) {
      var ts = new Date(a.date).getTime();
      if (a.type === "createCard" || a.type === "copyCard") {
        curList = a.data.list ? a.data.list.id : c.idList;
        curSince = ts;
      } else if (a.type === "updateCard" && a.data.listAfter) {
        if (curList && inProg[curList] && curSince) inProgMs += effectiveMs(curSince, ts, cfg);
        if (done[a.data.listAfter.id]) doneAt = ts;
        curList = a.data.listAfter.id;
        curSince = ts;
      }
    });
    // open interval (card still sitting in an in-progress list now)
    if (curList && inProg[curList] && curSince) inProgMs += effectiveMs(curSince, now, cfg);
    // if no actions captured, fall back to current list
    if (!curList) curList = c.idList;

    // estimate
    var estimate = null;
    if (estFieldId && c.customFieldItems) {
      c.customFieldItems.forEach(function (it) {
        if (it.idCustomField === estFieldId && it.value && it.value.number != null)
          estimate = parseFloat(it.value.number);
      });
    }

    var isDone = !!done[c.idList];
    var due = c.due ? new Date(c.due).getTime() : null;
    var completedAt = doneAt || (isDone ? now : null);
    var onTime = isDone && due ? completedAt <= due : null;

    return {
      id: c.id, name: c.name,
      members: (c.idMembers || []),
      owner: (c.idMembers && c.idMembers[0]) || null,
      actualMs: inProgMs, actualHrs: hrs(inProgMs),
      estimate: estimate, due: due, isDone: isDone, onTime: onTime,
      completedAt: completedAt,
    };
  });

  return { board: board, lists: lists, tasks: tasks, memberName: memberName, cfg: cfg };
}

/* ---------- filtering + rollups ---------- */
function visibleTasks() {
  var cut = Date.now() - STATE.range * 86400000;
  return DATA.tasks.filter(function (t) {
    if (STATE.member !== "all" && t.members.indexOf(STATE.member) === -1) return false;
    // only count tasks that have been completed within range for completion metrics view;
    // keep in-progress (not done) tasks too so workload reflects active work
    if (t.completedAt && STATE.range < 90 && t.completedAt < cut) return false;
    return true;
  });
}

function rollupByMember(tasks) {
  var map = {};
  tasks.forEach(function (t) {
    var owners = t.members.length ? t.members : ["_un"];
    owners.forEach(function (mid) {
      var r = map[mid] || (map[mid] = { id: mid, tasks: 0, actual: 0, est: 0, onTimeN: 0, dueN: 0, doneN: 0 });
      r.tasks += 1;
      r.actual += t.actualMs;
      if (t.estimate != null) r.est += t.estimate;
      if (t.isDone) r.doneN += 1;
      if (t.onTime != null) { r.dueN += 1; if (t.onTime) r.onTimeN += 1; }
    });
  });
  return Object.keys(map).map(function (mid, i) {
    var r = map[mid];
    return {
      id: mid,
      name: mid === "_un" ? "Unassigned" : (DATA.memberName[mid] || "Member"),
      color: colorFor(i),
      tasks: r.tasks,
      actualHrs: hrs(r.actual),
      estHrs: Math.round(r.est * 10) / 10,
      avgHrs: r.tasks ? hrs(r.actual / r.tasks) : 0,
      onTimePct: r.dueN ? Math.round((r.onTimeN / r.dueN) * 100) : null,
      onTimeN: r.onTimeN, lateN: r.dueN - r.onTimeN,
    };
  }).sort(function (a, b) { return b.tasks - a.tasks; });
}

/* ---------- rendering ---------- */
function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

function render() {
  var tasks = visibleTasks();
  var per = rollupByMember(tasks);
  var n = tasks.length || 1;
  var totalActual = tasks.reduce(function (a, t) { return a + t.actualMs; }, 0);
  var dueTasks = tasks.filter(function (t) { return t.onTime != null; });
  var onTimeN = dueTasks.filter(function (t) { return t.onTime; }).length;
  var estTasks = tasks.filter(function (t) { return t.estimate != null && t.actualHrs > 0; });
  var variance = estTasks.length
    ? Math.round(estTasks.reduce(function (a, t) { return a + (t.actualHrs - t.estimate) / t.estimate; }, 0) / estTasks.length * 100)
    : null;

  var app = document.getElementById("app");
  app.innerHTML = "";

  var rangeLabel = STATE.range === 90 ? "quarter" : STATE.range + " days";
  var activeMember = STATE.member === "all" ? "All members" : (DATA.memberName[STATE.member] || "Member");

  app.appendChild(el(
    '<div class="wrap">' +
      '<div class="head">' +
        '<div>' +
          '<div class="brand"><div class="mark">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>' +
          '</div><h1>TeamPulse</h1></div>' +
          '<p class="sub">Performance analytics · <span style="color:var(--ink)">' + DATA.board.name + '</span></p>' +
        '</div>' +
        '<div class="pill"><span class="dot"></span> Connected · live from board</div>' +
      '</div>' +

      '<div class="filters">' +
        '<div style="position:relative"><div class="select" id="memBtn"><span class="k">Member:</span> <span class="v">' + activeMember + '</span> ▾</div><div id="memMenu"></div></div>' +
        '<div class="seg" id="seg"></div>' +
      '</div>' +

      '<div class="grid kpis" id="kpis"></div>' +
      '<div style="height:16px"></div>' +
      '<div class="grid cols-2">' +
        '<div class="card"><h3 class="ptitle">Estimated vs actual time</h3><p class="phint">Hours per member — the gap is estimation accuracy</p><div class="chart-wrap" style="height:260px"><canvas id="cEst"></canvas></div></div>' +
        '<div class="card"><h3 class="ptitle">Deadline outcomes</h3><p class="phint">On time vs late</p><div class="chart-wrap" style="height:260px"><canvas id="cDue"></canvas></div></div>' +
      '</div>' +
      '<div style="height:16px"></div>' +
      '<div class="grid cols-half">' +
        '<div class="card"><h3 class="ptitle">Tasks per member</h3><p class="phint">Workload distribution</p><div class="chart-wrap" style="height:230px"><canvas id="cLoad"></canvas></div></div>' +
        '<div class="card"><h3 class="ptitle">Avg time per task</h3><p class="phint">Mean hours in progress</p><div class="chart-wrap" style="height:230px"><canvas id="cAvg"></canvas></div></div>' +
      '</div>' +
      '<div style="height:16px"></div>' +
      '<div class="card"><h3 class="ptitle">Member breakdown</h3><p class="phint">Per-person performance for the selected period</p><div id="tbl"></div></div>' +
      '<div class="foot">● Time is measured from your board\u2019s list-movement history' + (DATA.cfg.workHoursOnly ? ' (working hours only)' : ' (raw elapsed)') + '. Configure lists & hours in Power-Up settings.</div>' +
    '</div>'
  ));

  // KPIs
  kpi("kpis", [
    { lab: "Tasks", val: tasks.length, hint: "in the last " + rangeLabel, ic: C.blue, sym: "check" },
    { lab: "Avg time / task", val: hrs(totalActual / n) + "h", hint: "time in progress", ic: C.amber, sym: "clock" },
    { lab: "On-time rate", val: dueTasks.length ? Math.round(onTimeN / dueTasks.length * 100) + "%" : "—", hint: dueTasks.length ? "before due date" : "no due dates set", ic: C.green, sym: "target" },
    { lab: "Est. variance", val: variance == null ? "—" : (variance > 0 ? "+" : "") + variance + "%", hint: variance == null ? "set estimate field" : (variance > 0 ? "over estimate" : "under estimate"), ic: variance != null && variance > 0 ? C.red : C.green, sym: "timer" },
  ]);

  // segmented range
  var seg = document.getElementById("seg");
  [[7, "7d"], [30, "30d"], [90, "All"]].forEach(function (r) {
    var b = el('<button class="' + (STATE.range === r[0] ? "on" : "") + '">' + r[1] + '</button>');
    b.onclick = function () { STATE.range = r[0]; render(); };
    seg.appendChild(b);
  });

  // member menu
  var memBtn = document.getElementById("memBtn");
  var memMenu = document.getElementById("memMenu");
  memBtn.onclick = function () {
    if (memMenu.firstChild) { memMenu.innerHTML = ""; return; }
    var m = el('<div class="menu"></div>');
    var opts = [{ id: "all", name: "All members" }].concat(
      Object.keys(DATA.memberName).map(function (id) { return { id: id, name: DATA.memberName[id] }; })
    );
    opts.forEach(function (o, i) {
      var b = el('<button>' + (o.id !== "all" ? '<span class="swatch" style="background:' + colorFor(i - 1) + '"></span>' : "") + o.name + '</button>');
      b.onclick = function () { STATE.member = o.id; render(); };
      m.appendChild(b);
    });
    memMenu.appendChild(m);
  };

  drawCharts(per, onTimeN, dueTasks.length - onTimeN);
  drawTable(per);
}

function kpi(id, items) {
  var host = document.getElementById(id);
  items.forEach(function (k) {
    host.appendChild(el(
      '<div class="card kpi"><div class="row"><span class="lab">' + k.lab + '</span>' +
      '<span class="ico" style="background:' + k.ic + '14">' + glyph(k.sym, k.ic) + '</span></div>' +
      '<div class="val">' + k.val + '</div><div class="hint">' + k.hint + '</div></div>'
    ));
  });
}
function glyph(s, c) {
  var p = { check:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    timer:'<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>' }[s];
  return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
}

function destroy(k) { if (CHARTS[k]) { CHARTS[k].destroy(); delete CHARTS[k]; } }
var GRID = { color: C.faint }, TICK = { color: C.sub, font: { size: 11 } };
var noLegend = { legend: { display: false } };

function drawCharts(per, onTime, late) {
  var labels = per.map(function (m) { return firstName(m.name); });

  destroy("est");
  CHARTS.est = new Chart(document.getElementById("cEst"), {
    type: "bar",
    data: { labels: labels, datasets: [
      { label: "Estimated", data: per.map(function (m) { return m.estHrs; }), backgroundColor: C.line, borderRadius: 4 },
      { label: "Actual", data: per.map(function (m) { return m.actualHrs; }), backgroundColor: C.blue, borderRadius: 4 },
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 8, usePointStyle: true, color: C.sub, font: { size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: TICK }, y: { grid: GRID, ticks: TICK, beginAtZero: true } } },
  });

  destroy("due");
  CHARTS.due = new Chart(document.getElementById("cDue"), {
    type: "doughnut",
    data: { labels: ["On time", "Late"], datasets: [{ data: [onTime, late], backgroundColor: [C.green, C.red], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { boxWidth: 8, usePointStyle: true, color: C.sub, font: { size: 11 } } } } },
  });

  destroy("load");
  CHARTS.load = new Chart(document.getElementById("cLoad"), {
    type: "bar",
    data: { labels: labels, datasets: [{ data: per.map(function (m) { return m.tasks; }), backgroundColor: per.map(function (m) { return m.color; }), borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: noLegend, scales: { x: { grid: { display: false }, ticks: TICK }, y: { grid: GRID, ticks: TICK, beginAtZero: true, precision: 0 } } },
  });

  destroy("avg");
  CHARTS.avg = new Chart(document.getElementById("cAvg"), {
    type: "bar",
    data: { labels: labels, datasets: [{ data: per.map(function (m) { return m.avgHrs; }), backgroundColor: C.amber, borderRadius: 4 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: noLegend, scales: { x: { grid: GRID, ticks: TICK, beginAtZero: true }, y: { grid: { display: false }, ticks: TICK } } },
  });
}

function drawTable(per) {
  var rows = per.map(function (m) {
    var v = m.estHrs ? Math.round(((m.actualHrs - m.estHrs) / m.estHrs) * 100) : null;
    var otColor = m.onTimePct == null ? C.sub : m.onTimePct >= 70 ? C.green : m.onTimePct >= 40 ? C.amber : C.red;
    return '<tr>' +
      '<td><span class="who"><span class="avatar" style="background:' + m.color + '">' + (m.name.charAt(0)) + '</span><span class="nm">' + m.name + '</span></span></td>' +
      '<td class="tnum">' + m.tasks + '</td>' +
      '<td class="tnum">' + m.actualHrs + 'h</td>' +
      '<td class="tnum">' + m.avgHrs + 'h</td>' +
      '<td class="tnum"><span class="statusdot" style="background:' + otColor + '"></span>' + (m.onTimePct == null ? "—" : m.onTimePct + "%") + '</td>' +
      '<td class="tnum" style="font-weight:500;color:' + (v == null ? C.sub : v > 0 ? C.red : C.green) + '">' + (v == null ? "—" : (v > 0 ? "+" : "") + v + "%") + '</td>' +
    '</tr>';
  }).join("");
  if (!per.length) rows = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--sub)">No tasks in this period.</td></tr>';
  document.getElementById("tbl").innerHTML =
    '<table><thead><tr><th>Member</th><th>Tasks</th><th>Tracked</th><th>Avg / task</th><th>On-time</th><th>vs Estimate</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ---------- boot ---------- */
function showAuthorize() {
  document.getElementById("app").innerHTML =
    '<div class="center"><div style="font-size:16px;color:var(--ink)">Connect TeamPulse to your board</div>' +
    '<div style="max-width:340px">One-time read-only authorization lets the dashboard read your board\u2019s task history to calculate time and deadlines.</div>' +
    '<button class="btn" id="authBtn">Authorize</button></div>';
  document.getElementById("authBtn").onclick = function () {
    t.getRestApi().authorize({ scope: "read", expiration: "never" }).then(boot);
  };
}

function showConfigNeeded() {
  document.getElementById("app").innerHTML =
    '<div class="center"><div style="font-size:16px;color:var(--ink)">Almost there</div>' +
    '<div style="max-width:360px">Pick which list means <b>In Progress</b> and which means <b>Done</b> in the Power-Up settings (board menu → Power-Ups → TeamPulse → gear icon), then reopen.</div>' +
    '<button class="btn ghost" id="closeBtn">Close</button></div>';
  document.getElementById("closeBtn").onclick = function () { t.closeModal(); };
}

async function boot() {
  try {
    var authed = await t.getRestApi().isAuthorized();
    if (!authed) return showAuthorize();
    var cfg = await t.get("board", "shared", "tp_settings", DEFAULTS);
    if (!cfg.inProgressListIds.length || !cfg.doneListIds.length) return showConfigNeeded();
    DATA = await build(cfg);
    render();
  } catch (e) {
    document.getElementById("app").innerHTML =
      '<div class="center"><div style="color:var(--red)">Couldn\u2019t load data</div><div style="max-width:340px">' + (e.message || e) + '</div><button class="btn ghost" id="retry">Retry</button></div>';
    var r = document.getElementById("retry"); if (r) r.onclick = boot;
  }
}

t.render(function () {}); // keep iframe alive
boot();
