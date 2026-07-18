# Hackathon submission checklist

## Upload to GitHub

Commit the source and judge-facing materials:

- `src/`, `web/`, `scripts/`, and `tests/`
- `docs/`, including the Supabase setup and demo script
- `sample-data/`
- `README.md`, `package.json`, `package-lock.json`, TypeScript configuration, and `.env.example`
- Optional: `Product Requirements Document.docx` if it supports the story you want judges to see

Do **not** commit `node_modules/`, `dist/`, `.env`, API keys, Supabase service-role keys, admin passwords, or locally generated reports. The repository `.gitignore` prevents these files from being added by mistake.

## Before sharing the repository

1. Run `npm ci` and `npm run check` from a clean clone.
2. Confirm the README has local, Codex-mode, and public-deployment setup steps.
3. Verify every secret is set only in your hosting provider's environment-variable settings.
4. Add a license if the repository will be public.
5. If the repository is private, share it with `testing@devpost.com` and `build-week-event@openai.com` as required by the event rules.

## Devpost submission

- Use the GitHub repository URL.
- Choose the category that best fits the project.
- Describe the evidence-gated report generator, deterministic calculation boundary, editable assumptions, sourced research, PDF output, and optional private admin archive.
- Upload a public YouTube demo under three minutes. Show Codex account mode, brief organization, sourced research, report generation, and PDF download. Explain that GPT-5.6/Codex organized and researched while deterministic TypeScript owns calculations.
- Add the `/feedback` session ID where the main project work was done.
