# Meta Community Forums — Hide posts by user

Userscript that hides posts from users on your hidden-users list on [Meta Community Forums](https://communityforums.atmeta.com/). The list is stored locally in your userscript manager.

**Ways to hide someone:** use the **Hidden users** floating button (FAB) and panel, the **Hide User** item injected into each post’s message action (⋯) menu, or your userscript manager’s menu commands **MF: Hide user…** and **MF: Hide last-clicked profile** (after clicking a username/profile link in the tab).

**Ways to stop hiding someone:** use **Unhide** in the **Hidden users** panel, **MF: Stop hiding user…** in the userscript menu, or **MF: Import hidden users (JSON)…** to replace the list with pasted data. **MF: Manage hidden users…** opens the same panel as the FAB for both hiding and unhiding.

**Version:** 1.0.0 (see [`meta-forums-hide-users.user.js`](meta-forums-hide-users.user.js) for the source of truth).

## Requirements

- A userscript manager that supports **Tampermonkey**- or **Violentmonkey**-style APIs:
  - `GM_getValue`
  - `GM_setValue`
  - `GM_registerMenuCommand`
- The script runs at **`document-idle`** and only on `https://communityforums.atmeta.com/*`.

## Installation

1. Download or clone this repository and open [`meta-forums-hide-users.user.js`](meta-forums-hide-users.user.js).
2. In your userscript manager, create a new script from file (or paste the file contents) and save.
3. Enable the script and visit [Meta Community Forums](https://communityforums.atmeta.com/).

If the project is hosted on GitHub, you can also install from a raw URL (replace owner and repo):

`https://github.com/<owner>/<repo>/raw/main/meta-forums-hide-users.user.js`

## Usage

### Hide users (where and how)

| Where | What you do |
| --- | --- |
| **FAB — Hidden users** (bottom-right) | Open the panel, type or paste a profile URL, `/users/login/id`, numeric id, or login, then click **Hide**. |
| **Post action menu** (injected) | On a post, open the ⋯ **message action** menu and choose **Hide User** to hide that post’s author. |
| **Userscript manager menu** | **MF: Hide user…** — same inputs as the panel, via browser prompt. |
| **Userscript manager menu** | **MF: Hide last-clicked profile** — hides whoever owns the profile link you last clicked in this tab (click a username/avatar first). |

**MF: Manage hidden users…** opens the same **Hidden users** panel as the FAB (you can hide from there too).

### Stop hiding users (where and how)

| Where | What you do |
| --- | --- |
| **FAB — Hidden users** | Open the panel and click **Unhide** on the row for that user. |
| **Userscript manager menu** | **MF: Stop hiding user…** — enter the same kinds of identifiers as when hiding. |
| **Userscript manager menu** | **MF: Import hidden users (JSON)…** — Paste JSON to load a list (what you import becomes the stored list for that shape). |

**Full userscript manager menu (all `MF:` commands):** **MF: Manage hidden users…** · **MF: Hide user…** · **MF: Stop hiding user…** · **MF: Hide last-clicked profile** · **MF: View hidden users (JSON)…** · **MF: Import hidden users (JSON)…**

### JSON export / import

- **MF: View hidden users (JSON)…** — Show the current list as JSON to copy (read-only).
- **MF: Import hidden users (JSON)…** — Paste JSON in the shape `{ "blocked": [ { "id": "123", "login": "name" } ] }` (legacy `userIds` / `logins` shapes are also accepted); this **replaces** the stored blocklist with the imported entries.

### Input formats

When adding or removing via prompt or the panel, you can paste or type:

- A full profile URL, or
- A path like `/users/login/id`, or
- A numeric user id only, or
- A login name (letters, digits, `.`, `_`, `-`).

## Data and privacy

The hidden-users list is stored **only in your browser** via the userscript manager’s storage (key `mfHideUsers.blocklist`). This repository does not send your list to any server.

## Compatibility

The script relies on specific page structure (for example `main#main-content`, `article[data-testid="StandardMessageView"]`, and author links with `data-testid="userLink"`). If Meta changes the forum UI, hiding or menu integration may stop working until the script is updated.
