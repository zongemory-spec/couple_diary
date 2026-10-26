<div align="center">

<img src="docs/assets/readme-cover.svg" alt="Couple Diary: cherry blossoms, fireworks, maple leaves and a snowy night" width="880">

# Couple Diary

**A little home for your everyday moments, memories and next hello.**

[简体中文](README.md) · **English** · [日本語](README.ja.md)

[Get started](#get-started) · [Features](#features) · [WeChat Mini Program](#wechat-mini-program) · [Email reminders](#email-reminders) · [MIT license](LICENSE)

</div>

---

A private diary you host for two. Share a small wish, plan your next meeting, and keep the moments you want to return to—with Japanese seasonal scenery in the background.

**Open code. Your own diary.** Each couple creates a separate backend and two accounts. This repository does not provide a shared hosted service. These docs are available in Chinese, English and Japanese; the app and setup wizard currently use primarily Chinese.

## Features

| Space | What you can do together |
| :--- | :--- |
| 💌 Affection shop | Place zero-cost orders for attention or company; reply and mark delivery. Create, edit and remove shared products, with optional prices and shopping links. |
| 📷 Shared memories | Save titles, places, stories, moods and photos. Expand details, edit entries and enlarge pictures. |
| 🗓️ Meeting plans | Set a date range, place and itinerary; see a countdown, first-day celebration, together status and end-of-trip reminder. Share private Word / PDF attachments. |
| ✨ Wishes | Add categories, turn wishes into meeting plans, and save fulfilled wishes as memories. |
| ☁️ Mood room | Share a mood and photo for 24 hours. Older entries remain in the monthly mood calendar. |
| 📨 Home notes | Follow each other's updates, reactions and read history. |
| 🌸 Seasonal scenes | Cherry blossoms, fireworks, maple leaves and snowy nights. A random scene on launch, with gentle changes every two minutes while you stay. |
| 🔔 Optional email | Reminders for new orders, first delivery, moods, memories, wishes and plan changes. |

> Zero-cost orders express affection; they do not process payments. Prices and external shopping links are optional information.

## Get started

**Recommended: GitHub → Supabase → Cloudflare Pages.** Email and a WeChat developer account are optional for the web version.

### 1 · Create your own repository

Choose **Use this template → Create a new repository**. Public or private both work. If the template button is unavailable, fork it or upload the downloaded source to a new repository.

### 2 · Create a backend and two users

Create a project in [Supabase](https://supabase.com/dashboard). Under **Authentication → Users → Add user → Create new user**, create two users with different email addresses, check **Auto Confirm User**, keep their passwords private, and copy both user UUIDs.

Disable public sign-ups and anonymous sign-ins; **keep Email sign-in enabled**. Find the Project URL on the project overview / Connect screen and the Publishable key under API Keys.

### 3 · Generate your configuration locally

In your repository, choose **Code → Download ZIP** and extract it. Open root-level `setup.html` in a desktop browser. Enter both nicknames, your anniversary, the Project URL, Publishable key and both UUIDs. Download **`setup-private.sql`** and **`config.js`**.

The wizard processes these fields locally. It does not need account passwords, the database password or email credentials.

### 4 · Install the database and configure the website

Paste the entire generated `setup-private.sql` into **Supabase → SQL Editor → new query → Run**. A successful run ends with two member rows, a and b. Replace **`site/config.js`** in your own repository with the generated file and commit it.

### 5 · Deploy with Cloudflare Pages

In [Cloudflare](https://dash.cloudflare.com/), open **Workers & Pages → Create application → Pages / Continue to Pages → Connect to Git / Import Git repository** and connect your repository.

| Setting | Value |
| :--- | :--- |
| Production branch | `main`, or your actual default branch |
| Framework preset | `None` |
| Build command | `python3 tools/build.py` |
| Build output directory | `dist` |
| Root directory | Leave at the repository root |

Save and deploy. Open the assigned production HTTPS address on both phones. Sign in separately and test an order, a mood and a photo to confirm synchronization.

Commits to your connected repository trigger a rebuild. Changes in the original template do not automatically merge into your copy.

📖 [Detailed deployment & troubleshooting — Chinese](docs/DEPLOY.md) · [Security](SECURITY.md)

## WeChat Mini Program

| Option | Availability |
| :--- | :--- |
| Web app in a phone browser | The complete deployment route supported by this repository; email sign-in and Supabase. |
| Native WeChat Mini Program | A separate, earlier codebase using WeChat identity and CloudBase. **Not included here and not at feature parity with this web app.** |

The HTML, CSS and Supabase scripts in this repository cannot be uploaded as a native Mini Program. If you already have the earlier native source package, follow the [WeChat deployment guide — Chinese](docs/WECHAT.md). It covers the required source tree, AppID, CloudBase collections, access rules, two-person allowlist and trial-version checks.

This guide does not convert the current web app into a Mini Program. Opening a website inside WeChat is also different from installing a Mini Program; test access using both partners' usual networks and browsers.

## Email reminders

Email is optional and independent of the core app. The default Gmail route uses **member B's bound Gmail sign-in address** as the sender, with that account owner's consent. Recipients are restricted to the two bound users.

<details>
<summary>Set up Gmail reminders</summary>

1. Enable two-step verification on that Google account, then create an [app password](https://myaccount.google.com/apppasswords). Use the 16-character app password, not the normal sign-in password.
2. In **Supabase → Edge Functions → Secrets**, save:

   | Name | Value |
   | :--- | :--- |
   | `MAIL_PROVIDER` | `gmail` |
   | `GMAIL_APP_PASSWORD` | That account's app password |
   | `DIARY_SITE_URL` | Your production HTTPS homepage |
   | `DIARY_MAIL_WORKER_SECRET` | A random secret of at least 32 characters |

3. Create an Edge Function named **`diary_mail`**, replace its `index.ts` with the full contents of `supabase/functions/diary-mail/index.ts`, and deploy. Disable **Verify JWT with legacy secret**; this worker checks its own separate task secret.
4. In `database/mail-schedule.example.sql`, replace `YOUR_PROJECT_REF` with the project reference from your Supabase URL and replace the secret placeholder with the same worker secret. Run it in your own SQL Editor. Do not commit the filled-in SQL.
5. Place a new order, wait for the scheduled worker, and check the inbox and spam folder. See the [mail guide — Chinese](docs/MAIL.md) for the queue-status query.

New orders, first delivery, new moods, memories, wishes, and plan creation / edits send reminders. Replies, reading and product maintenance do not. Enabling email does not replay past events.

The deployed name uses an underscore, **`diary_mail`**; the source directory uses a hyphen, `diary-mail`.

</details>

## Your data & privacy

Use a separate Supabase project for each couple. Sign-in, a two-member allowlist and RLS protect access. Keep photo and attachment buckets **Private**. This is not a multi-couple backend.

The Project URL and Publishable key in `site/config.js` are public client configuration. **Never put database passwords, SMTP / Gmail app passwords, task secrets, Secret keys or service_role keys in frontend code or your repository.**

Nicknames may appear on the public sign-in screen. Do not use private contact details as display names. Provider quotas, availability and charges depend on their current plans; the source code itself is free.

## Development

Use Node.js 24+ and Python 3. The build uses only Python's standard library; npm installs the test dependencies.

```sh
npm install
npm test
python3 tools/build.py
```

The build creates `dist/index.html` and `dist/_headers`, with scripts, fonts and scenery embedded. For Pages Direct Upload, put both files directly at the ZIP root, without an extra enclosing folder.

<details>
<summary>Repository layout & optional environment variables</summary>

```text
site/                 Web app, animations and seasonal assets
setup.html            Local setup wizard
tools/                Configuration and build tools
database/             Database installer and mail schedule example
supabase/functions/   Optional mail worker
tests/                Tests using fictional data
docs/                 Deployment, reference and WeChat guides
```

Alternatively, set both `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Cloudflare instead of entering connection values in `site/config.js`. Only use a Publishable key. This mode shows generic names before sign-in and reads your names from the database afterward.

</details>

## License & contributions

Code is licensed under [MIT](LICENSE): free to use, modify and use commercially, with the license and copyright notice preserved. The font is separately licensed under [SIL OFL 1.1](FONT-LICENSE.txt). See [third-party notices](THIRD_PARTY_NOTICES.md) for assets and dependencies.

Issues and pull requests are welcome. Remove real diary entries, email addresses, credentials and private photos from reports.

<div align="center">

**Small moments. A story for two.**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

</div>
