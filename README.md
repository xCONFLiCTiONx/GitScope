<p align="center">
  <img src="ICON.png" width="128" alt="GitScope Logo">
</p>

# GitScope

GitScope is a high-performance, local-first Git management suite designed for professional developers handling complex, multi-repository workspaces. **Engineered specifically for peak performance on Windows.**

## 🛡️ Security First: Privacy Search
GitScope includes a powerful, built-in **Privacy Search** engine designed to prevent accidental data leaks.
- **Deep Scanning:** Recursively scans your project files for sensitive data using advanced regex patterns.
- **Pre-configured Patterns:** Detects API Keys, PEM Private Keys, JWTs, SSNs, Credit Cards, Database URIs, and more.
- **Customizable:** Add your own search terms and toggle specific patterns on/off for targeted scans.
- **Git-Aware:** Automatically respects your `.gitignore` rules to avoid scanning ignored directories.
- **Real-time Remediation:** Instantly run `git rm --cached` or append sensitive files to `.gitignore` directly from the results view.

## 🪟 Windows Optimization
GitScope leverages native Windows components for a seamless professional experience:
- **Integrated PTY:** High-performance built-in terminal powered by `node-pty` for real-time shell interaction.
- **Explorer Integration:** Right-click context menus and direct "Show in Folder" navigation.
- **Atomic File Operations:** Robust write-and-swap logic to handle Windows file locks on critical configurations.
- **System Theme Sync:** Deeply integrated dark theme that feels native to modern Windows environments.

## 🚀 Key Features

### 📊 Workspace Command Center
A real-time dashboard providing total visibility into your local development environment.
- **Intelligent Filtering:** One-click views for projects needing attention, out-of-sync repos, or local-only work.
- **Project Health:** Automatically detects missing folders, unborn repositories, and upstream drift.

### 📜 Global Git Config Management
- **Audit Engine:** Scans your global `.gitconfig` and recommends optimizations like Histogram diffing and zdiff3 merge styles.
- **Direct Editing:** Safe, validated editing of your global Git settings without leaving the app.

### 🌿 Advanced Branching & Commits
- **Smart Amending:** Amend last commits with preserved messages for rapid micro-adjustments.
- **Multi-Cloud Sync:** Rename branches locally and on remotes simultaneously with automatic tracking updates.
- **AI-Ready Commits:** Generate descriptive commit messages based on staged changes (feature-ready).

### 🔍 Advanced Diff & History
- **Interactive Patching:** View surgical diffs for uncommitted changes or any point in your commit history.
- **Seamless Navigation:** Jump from a diff line directly to the editor at that exact position.

### 📦 Professional Editor & Markdown
- **Monaco Engine:** The same high-performance editor powering VS Code, integrated for lighting-fast edits.
- **Real-time Preview:** Professional Markdown environment with side-by-side preview and formatting normalization.
- **Encoding Mastery:** Switch between UTF-8 and legacy Windows encodings with automated line-ending conversion.

## 🛠️ Technology Stack
- **Framework:** Electron & Node.js
- **Git Engine:** simple-git
- **Editor:** Monaco Editor
- **UI:** Modern HTML5/CSS3 with xterm.js integration

## 📦 Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/xCONFLiCTiONx/GitScope.git
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Launch the suite:**
   ```bash
   npm start
   ```

## 🏗️ Production Build
To package GitScope as a standalone Windows executable:
```bash
npm run build
```
The portable binary will be generated in the `/dist` directory.

## 📋 System Requirements
- **OS:** Windows 10 or 11
- **Git:** Git for Windows installed and added to PATH.

---
*Created for developers who demand more than a basic Git GUI.*
