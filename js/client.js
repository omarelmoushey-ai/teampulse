/* =========================================================
   TeamPulse — Trello Power-Up capabilities
   ---------------------------------------------------------
   IMPORTANT: replace the APP_KEY below with your own Trello
   Power-Up API key (Power-Up Admin → API Key tab).
   ========================================================= */
var APP_KEY = "REPLACE_WITH_YOUR_TRELLO_API_KEY";

/* A simple bar-chart glyph (dark, for the light board header) */
var ICON =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>'
  );

window.TrelloPowerUp.initialize(
  {
    "board-buttons": function (t) {
      return [
        {
          icon: { dark: ICON, light: ICON },
          text: "TeamPulse",
          callback: function (t) {
            return t.modal({
              url: "./dashboard.html",
              title: "TeamPulse — Performance Analytics",
              fullscreen: true,
              accentColor: "#1a73e8",
            });
          },
        },
      ];
    },

    "show-settings": function (t) {
      return t.popup({
        title: "TeamPulse Settings",
        url: "./settings.html",
        height: 420,
      });
    },
  },
  {
    appKey: APP_KEY,
    appName: "TeamPulse",
  }
);
