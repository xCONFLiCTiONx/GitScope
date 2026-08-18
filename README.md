# GitScope

GitScope is a high-performance, local-first Git management suite designed for professional developers handling complex, multi-repository workspaces. **Note: This application is specifically optimized and designed for Windows.**

![GitScope Banner](ICON.png)

## 🪟 Windows Optimization
GitScope leverages specific Windows-native components for peak performance:
- **Windows Terminal Integration:** Uses `wt.exe` for high-performance external terminal sessions.
- **PowerShell Mastery:** Built-in support for standard Windows system paths and environment configurations.
- **Explorer Sync:** Direct integration with Windows File Explorer for project management.


## 🚀 Key Features

### 📊 Workspace Overview
A real-time command center showing the state of all your projects. Instantly filter by:
- **Attention:** Projects with uncommitted work.
- **Sync:** Repositories ahead or behind their remotes.
- **Local Only:** Projects not yet published to GitHub.
- **Missing:** Detects projects that were moved or deleted from your disk.

### 🧙‍♂️ Smart Sync Distribution
Surgically distribute content from a source project to multiple target repositories.
- **Auto-Matching:** Automatically links folders in your source to matching projects in your workspace.
- **Fuzzy Precision:** Intelligent name matching that ignores hyphens, spaces, and case.
- **Safe Overwrite:** High-speed file synchronization with toggleable overwrite protection.

### 📂 Advanced Mass Transfer
Move or copy items from "Project A" to multiple target folders simultaneously.
- **Folder Tree Integration:** A full workspace folder selector allows you to target specific sub-directories across many projects at once.
- **One-to-Many Logic:** Select one source item and blast it to every checked destination folder in one click.

### 📜 Global Git Config Editor
A built-in management suite for your global `.gitconfig`.
- **Best-Practice Engine:** Automatically scans your config and recommends professional optimizations (Histogram diff, zdiff3 merging, auto-upstream tracking, etc.).
- **Atomic Saving:** Uses high-reliability write-and-swap logic to bypass Windows file locks.

### 🌿 Intelligent Branching
- **Auto-Sync Creation:** Creating a new branch automatically stages all changes and creates an "Initial commit" to preserve your state.
- **Cloud Rename:** Rename branches both locally and on GitHub simultaneously, with automatic upstream re-tracking.

### 📦 Surgical Stash Management
A dedicated interface to manage your work-in-progress. Save, List, Pop, Apply, and Drop stashes with descriptive labels and real-time UI updates.

### 💻 Integrated Environment
- **Monaco Editor:** A high-performance code editor built-in for quick edits and .gitignore management.
- **Pro Terminal:** A full xterm.js terminal embedded directly in the app.
- **AI Commits:** Automated commit message generation based on your actual file diffs.

## 🛠️ Technology Stack

- **Core:** Electron & Node.js
- **Git Engine:** simple-git
- **Interface:** HTML5/CSS3 (Modern Dark Theme)
- **Editor:** Monaco Editor (VS Code Engine)
- **Terminal:** xterm.js

## 📦 Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/xCONFLiCTiONx/GitScope-Desktop.git
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Launch the app:**
   ```bash
   npm start
   ```

## ⚙️ Configuration

- **Root Directory:** Set your primary repositories folder in Settings. GitScope will watch it and keep your dashboard synced.
- **GitHub PAT:** Add a Personal Access Token with `repo` scope to enable seamless GitHub publishing and importing.

## 📋 System Requirements
- **OS:** Windows 10 or 11
- **Terminal:** [Windows Terminal](https://apps.microsoft.com/store/detail/windows-terminal/9N0DX20HK701) (Recommended for the `wt.exe` feature)
- **Git:** Git for Windows installed and added to PATH.

---
*Created for developers who need more power than a simple Git GUI.*
