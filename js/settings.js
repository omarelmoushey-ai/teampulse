var APP_KEY = "REPLACE_WITH_YOUR_TRELLO_API_KEY";
var t = window.TrelloPowerUp.iframe({ appKey: APP_KEY, appName: "TeamPulse" });

var DEFAULTS = {
  inProgressListIds: [], doneListIds: [],
  estimateFieldName: "Estimate (hrs)",
  workHoursOnly: true, workDays: [0, 1, 2, 3, 4], dayStart: 9, dayEnd: 18,
};
var DAYS = [["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6]];

function esc(s){return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

async function init() {
  var lists = await t.lists("id", "name");
  var cfg = await t.get("board", "shared", "tp_settings", DEFAULTS);

  var checks = function (selected) {
    return lists.map(function (l) {
      return '<label class="checkrow"><input type="checkbox" value="' + l.id + '"' +
        (selected.indexOf(l.id) !== -1 ? " checked" : "") + "> " + esc(l.name) + "</label>";
    }).join("");
  };
  var dayChecks = DAYS.map(function (d) {
    return '<label class="checkrow" style="display:inline-flex;margin-right:10px"><input type="checkbox" class="wd" value="' + d[1] + '"' +
      (cfg.workDays.indexOf(d[1]) !== -1 ? " checked" : "") + "> " + d[0] + "</label>";
  }).join("");

  document.getElementById("set").innerHTML =
    '<div class="set-group"><label class="h">“In Progress” list(s) — time is counted here</label><div id="ip">' + checks(cfg.inProgressListIds) + '</div></div>' +
    '<div class="set-group"><label class="h">“Done” list(s) — marks a task complete</label><div id="dn">' + checks(cfg.doneListIds) + '</div></div>' +
    '<div class="set-group"><label class="h">Estimate field name (number custom field)</label><input type="text" id="ef" value="' + esc(cfg.estimateFieldName) + '"><div class="hintline">Create a number custom field with this exact name to enable estimate comparisons.</div></div>' +
    '<div class="set-group"><label class="checkrow"><input type="checkbox" id="wh"' + (cfg.workHoursOnly ? " checked" : "") + '> Count working hours only</label>' +
      '<div id="whBox" style="margin-top:8px;' + (cfg.workHoursOnly ? "" : "opacity:.4;pointer-events:none") + '">' +
        '<div style="margin-bottom:8px">' + dayChecks + '</div>' +
        '<div class="inline"><div><label class="hintline">Day start</label><input type="number" id="ds" min="0" max="23" value="' + cfg.dayStart + '"></div>' +
        '<div><label class="hintline">Day end</label><input type="number" id="de" min="1" max="24" value="' + cfg.dayEnd + '"></div></div>' +
      '</div></div>' +
    '<div class="save-row"><button class="btn" id="save">Save</button></div>';

  document.getElementById("wh").onchange = function () {
    var box = document.getElementById("whBox");
    box.style.opacity = this.checked ? "1" : ".4";
    box.style.pointerEvents = this.checked ? "auto" : "none";
  };

  document.getElementById("save").onclick = async function () {
    var pick = function (sel) {
      return Array.prototype.slice.call(document.querySelectorAll(sel + " input:checked")).map(function (i) { return i.value; });
    };
    var next = {
      inProgressListIds: pick("#ip"),
      doneListIds: pick("#dn"),
      estimateFieldName: document.getElementById("ef").value.trim() || "Estimate (hrs)",
      workHoursOnly: document.getElementById("wh").checked,
      workDays: Array.prototype.slice.call(document.querySelectorAll(".wd:checked")).map(function (i) { return parseInt(i.value, 10); }),
      dayStart: parseInt(document.getElementById("ds").value, 10) || 9,
      dayEnd: parseInt(document.getElementById("de").value, 10) || 18,
    };
    await t.set("board", "shared", "tp_settings", next);
    t.closePopup();
  };

  t.sizeTo("body");
}
init();
