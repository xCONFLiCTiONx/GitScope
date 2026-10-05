# GitScope Privacy Policy

**Effective Date:** August 25, 2026

GitScope is a local-first desktop wrapper for Git repository management.

## 1. Data Collection & Privacy

GitScope does not collect or send telemetry to its developers. Repository management and analysis run locally, except when you explicitly use an integration that communicates with a third-party service, such as GitHub or the Gemini sidebar described below.

## 2. Local Processing

All Git operations and repository analysis happen locally using your system's installed Git binary. Any data used to generate the dashboard and tree views is processed in-memory and stored locally in your application's data directory.

## 3. GitHub Integration

If you choose to use the GitHub integration features (like repository fetching or visibility toggling), GitScope communicates directly with the GitHub API using the Personal Access Token you provide. Your token is stored securely on your local machine and is never shared with us or any third party.

## 4. Gemini Sidebar

GitScope can display the official Gemini web app in an embedded sidebar. When you explicitly open Gemini using the sidebar button or **Ctrl+Shift+G**, GitScope sends context from the current view to Gemini and submits it as a message. For an open file, this includes its current editor contents (including unsaved changes) and selected text when present. Repository views can include the current branch, changed files, status, or diffs; the dashboard includes registered repository names and paths. The Gist view can include its visible list, and the theme editor can include its current theme text. Settings and credential values are not included.

This feature sends the selected context to Google through the Gemini web app. Google handles that information under its own terms and privacy policy. Gemini sign-in data is kept in a persistent local Electron session, subject to Google's session policies. Do not invoke the feature while sensitive information is open if you do not want that information sent to Gemini.

## 5. Third-Party Services

GitScope does not include third-party tracking, telemetry, or analytics. Information is shared with external services only when you choose to use an integration, including GitHub and the Gemini sidebar.
