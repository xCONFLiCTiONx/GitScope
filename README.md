# GitScope

GitScope is a high-performance, local-first Git management suite designed for professional developers handling complex, multi-repository workspaces. **Note: This application is specifically optimized and designed for Windows.**

![GitScope Banner](ICON.png)

## 🪟 Windows Optimization
GitScope leverages specific Windows-native components for peak performance:
- **Windows Terminal Integration:** Uses `wt.exe` for high-performance external terminal sessions.
- **PowerShell Mastery:** Built-in support for standard Windows system paths and environment configurations.
- **Explorer Sync:** Direct integration with Windows File Explorer for project management.
- **Atomic Operations:** High-reliability write-and-swap logic to bypass Windows file locks on sensitive files like `.gitconfig`.


## 🚀 Key Features

### 📊 Workspace Overview
A real-time command center showing the state of all your projects. Instantly filter by:
- **Attention:** Projects with uncommitted work.
- **Sync:** Repositories ahead or behind their remotes.
- **Local Only:** Projects not yet published to GitHub.
- **Missing:** Detects projects that were moved or deleted from your disk.

### 📜 Global Git Config Editor
A built-in management suite for your global `.gitconfig`.
- **Best-Practice Engine:** Automatically scans your config and recommends professional optimizations (Histogram diff, zdiff3 merging, auto-upstream tracking, etc.).

### 🌿 Intelligent Branching & Commits
- **Amend Support:** Instantly amend your last commit with a single toggle. GitScope automatically pre-fills your last message for quick tweaks.
- **Auto-Sync Creation:** Creating a new branch automatically stages all changes and creates an "Initial commit" to preserve your state.
- **Cloud Rename:** Rename branches both locally and on GitHub simultaneously, with automatic upstream re-tracking.

### 🔍 Advanced Diff Viewer
- **Live File Diffs:** Quick-view uncommitted changes with syntax-highlighted diffs.
- **Commit History Diffs:** Browse your entire commit history and view the exact patch for any previous commit with a single click.
- **Surgical Transitions:** "Edit" button directly in the diff view jumps you straight to that file in the editor and reveals it in your folder tree.

### 📦 Surgical Stash Management
A dedicated interface to manage your work-in-progress. Save, List, Pop, Apply, and Drop stashes with descriptive labels and real-time UI updates.

### 💻 Professional Editor Environment
- **Monaco Engine:** A full-featured code editor (the same engine powering VS Code) integrated for quick edits.
- **Smart Encoding:** Real-time detection of UTF-8 vs ANSI (Windows-1252). Convert line endings to CRLF or ensure UTF-8 encoding with one click.
- **Navigation Guard:** Never lose work again. GitScope monitors your editor state and prompts you to save changes if you attempt to navigate away while the file is "dirty".
- **Editable Markdown Preview:** Real-time side-by-side or full-screen Markdown preview. Edit the preview directly and GitScope syncs it back to your source file with optimized spacing and formatting normalization.

## 🛠️ Technology Stack

- **Core:** Electron & Node.js
- **Git Engine:** simple-git
- **Interface:** HTML5/CSS3 (Modern Dark Theme)
- **Editor:** Monaco Editor
- **Terminal:** xterm.js

## 📦 Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/xCONFLiCTiONx/GitScope.git
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Launch the app:**
   ```bash
   npm start
   ```

## 🏗️ Building for Production (.exe)
To package GitScope as a standalone, portable Windows executable:

1. **Generate the binary**:
   Run the high-speed build script (skipping unnecessary native rebuilds):
   ```bash
   npx electron-builder -c.npmRebuild=false
   ```
2. **Locate your App**:
   The standalone binary will be generated in the `/dist` directory.

## 📋 System Requirements
- **OS:** Windows 10 or 11
- **Terminal:** [Windows Terminal](https://apps.microsoft.com/store/detail/windows-terminal/9N0DX20HK701) (Required for the `wt.exe` feature)
- **Git:** Git for Windows installed and added to PATH.

---
*Created for developers who need more power than a simple Git GUI.*
