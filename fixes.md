# GitScope - Development Fixes & Improvements

A detailed summary of recent bug fixes and architectural improvements.

## Latest Fixes (Aug 26, 2026)

### Repository Context & Path Resolution
- **Nested Repository Support**: Implemented `findRepoForPath` utility that uses "deepest match" logic. This ensures that when a file is opened inside a nested repository, GitScope correctly identifies the child repository rather than the parent.
- **Active Project Synchronization**: Fixed an issue where switching between files in different projects wouldn't update the active repository context. Closing a file now correctly returns the UI to the project that owned that file.
- **Terminal Sync**: Opening a file now automatically triggers a `cd` command in the integrated terminal to the correct repository root.
- **Bug Fix**: Resolved `ReferenceError: normTarget is not defined` when clicking the "Edit" button in the diff view.
- **Bug Fix**: Fixed a missing variable error in the "Apply Patch" logic.
- **Drag & Drop Sync**: Dropping files into a project folder now automatically switches the active repository context to the destination project.

### Windows Integration & Security
- **Admin Execution (Spaces Fix)**: Fixed "Execute as Admin" for files with spaces in their path (e.g., `Clear DNS.bat`). Refactored to use PowerShell's `-EncodedCommand` (Base64) to bypass standard shell quoting limitations.
- **UAC Graceful Exit**: Added error handling for the Windows UAC elevation prompt. If a user cancels the prompt, the application now remains silent instead of throwing a PowerShell stack trace error.

### Console & UI Experience
- **Console Auto-Scroll**: Fixed a bug where the console would stop auto-scrolling to the bottom if logs were added while the **TERMINAL** tab was active.
- **Sidebar Cleanup**: Removed redundant "Unstage All" icon that was visually identical to the "Refresh" icon and prone to accidental clicks.
- **Markdown Preview Interactions**: 
    - Implemented **CTRL+Click** behavior for links in the markdown preview.
    - Updated cursor logic to show a hand pointer only when CTRL is held (standard editor behavior).
    - Fixed link interception to ensure external URLs open in the system's default browser instead of trying to load inside the app shell.

### Performance Optimizations
- **Reduced Startup Pause**: Eliminated the ~1 second freeze when opening the app by switching to `DOMContentLoaded` and deferring the initialization of the heavy Monaco Editor until after the primary UI has rendered.
- **Main Process Caching**: Added in-memory caching for settings and repository metadata in the Electron main process to speed up initial data hydration.

## Previous Fixes (Aug 25, 2026)

### Git Operations
- **Subtree Hub Reliability**: Improved folder auto-matching logic for subtree mappings.
- **Bulk Action Stability**: Enhanced the stability of bulk fetch/pull operations across many repositories to prevent process saturation.
- **Git Config Editor**: Fixed issues with saving entries to the global `.gitconfig` and improved the visual layout of the config editor.

### File System
- **External Change Detection**: Improved the `chokidar` watcher implementation to better handle rapid-fire file changes from external IDEs.
- **Encoding Support**: Enhanced UTF-8 detection and conversion during file reads.
