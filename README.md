# TeamPulse — Trello Performance Analytics Power-Up

A no-server Trello Power-Up that builds a clean, Google-minimal analytics dashboard
on top of any single board. It measures how long each task spent in your **In Progress**
list (read from Trello's own card-movement history), compares **actual vs estimate** and
**actual vs deadline**, and visualizes workload, on-time rate, and per-member performance.

No backend, no database. Everything is computed in the browser when the dashboard opens,
straight from your board's data.

---

## What you get

- **Board button → full-screen dashboard** with KPI tiles, charts, and a per-member table.
- **Auto time tracking** from list movements — no manual timers.
- **Working-hours-only** calculation (default: Sun–Thu, 09:00–18:00) so weekends/nights
  don't inflate a person's "time on task." Fully configurable, or switch to raw elapsed.
- **Settings panel** to choose your In Progress / Done lists and the estimate field name.

---

## Prerequisites

1. You're an **admin** of the Trello Workspace you want to add this to.
2. A static host (any of these work — pick one):
   - **Vercel** (recommended): `vercel deploy` in this folder, choose "static".
   - **GitHub Pages**: push this folder to a repo, enable Pages.
   - **Netlify / Cloudflare Pages**: drag-and-drop the folder.
   Whatever you choose, you'll end up with an HTTPS URL like
   `https://teampulse.yourdomain.com/` that serves `index.html`.

---

## Step 1 — Get a Power-Up API key

1. Go to https://trello.com/power-ups/admin and click **New** to create a Power-Up
   (name it "TeamPulse", select your Workspace).
2. Open the **API Key** tab on the Power-Up and click **Generate a new API Key**.
3. Copy that key.

## Step 2 — Paste your API key into the code

Replace `REPLACE_WITH_YOUR_TRELLO_API_KEY` in **all three** files:

- `js/client.js`
- `js/dashboard.js`
- `js/settings.js`

(Same key in each.)

## Step 3 — Deploy

Upload/deploy this folder to your static host. Confirm `https://YOUR_URL/index.html` loads
without errors.

## Step 4 — Wire the Power-Up to your deployment

Back in the Power-Up admin (https://trello.com/power-ups/admin):

1. **Basic Information** → set the **Iframe connector URL** to `https://YOUR_URL/index.html`.
2. **Capabilities** → enable **board-buttons** and **show-settings** (the code already
   declares them; just make sure they're toggled on).
3. On the API Key tab, add your deployment domain to the **Allowed origins** if prompted.
4. Save. The first time, you'll accept Trello's **Joint Developer Agreement**.

## Step 5 — Add it to a board & configure

1. Open a board → **Power-Ups** → **Custom** → enable **TeamPulse**.
2. Click the **gear/settings** on the Power-Up and set:
   - Which list(s) = **In Progress** (time is counted while a card sits here).
   - Which list(s) = **Done** (entering this completes the task; on-time is judged here).
   - Working-hours options.
3. (Optional but recommended) Create a **number custom field** named exactly
   `Estimate (hrs)` so the actual-vs-estimate metrics light up. You can rename it in
   settings if you prefer another label.
4. Click the **TeamPulse** button in the board header → **Authorize** once (read-only) →
   the dashboard loads.

---

## How "time in progress" is calculated

Trello logs every list move as an action. The dashboard pulls the board's
`createCard` / `updateCard` movement actions, reconstructs each card's timeline, and sums
the time it spent in your In Progress list(s). If working-hours-only is on, only the
overlap with your working windows is counted.

**Notes & limits**
- A card that's still in In Progress counts up to "now".
- Very old movements rely on Trello's action history; if a card hasn't moved in a long
  time and predates the available log, its earliest interval may be approximate.
- A task assigned to multiple members is counted for each of them (workload view).
  Tell your developer if you'd rather split or attribute to a single owner.
- Time math uses the viewer's local timezone — fine for a single-region team.

---

## File map

```
index.html        Power-Up connector (loads the Trello client)
dashboard.html    Full-screen dashboard shell
settings.html     Settings popup shell
js/client.js      Capabilities: board button + settings
js/dashboard.js   Auth, data fetch, time math, charts, table
js/settings.js    List & working-hours configuration
css/style.css     Google-minimal styling
```
