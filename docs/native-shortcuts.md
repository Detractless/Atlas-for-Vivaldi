# macOS native shortcuts

Tap and release either Command key, then tap Space twice to open an Atlas tab,
Delete/Backspace twice to close the original active tab, Left/Right arrow twice
to move to the previous/next tab (wrapping at the ends), or comma/period twice
to go back/forward in the original tab. The existing
Command double-tap still toggles address-bar focus. Ordinary typing passes through.

The universal AppKit library runs inside Vivaldi's main process. A local event
monitor consumes the target key-down and key-up events before protected pages
receive them. Identical redispatched native events are counted once; Command
press/release comes from macOS's side-specific flags. No helper app, global event
monitor, Accessibility permission, polling loop or text logging is used.

The filter cancels on other keys, mouse presses, application/window changes,
extra modifiers and timeouts. Repeated key-downs cannot become a second tap.
Hidden native menu events reach the Atlas window that owns the input. Before
acting, the UI checks that the original tab is still active. Existing leader
states are cleared so the page handlers cannot repeat the action.

The existing limits remain: two seconds for the leader and two seconds for the
confirmation; double-Command uses its existing 450 ms limit. The new-tab/close/arrow
sequences require two completed target presses of the same key, not key repeat.
Left then Right (or any mixed pair) cancels instead of switching.

Build on macOS: `python3 scripts/build_native_shortcuts.py`, then
`python3 scripts/bundle.py`. The installer copies the signed library into the
app's Frameworks directory and adds an app-local `LSEnvironment` loader entry.
Launch Atlas normally through Finder, Dock or `open -a`; directly executing its
Mach-O binary does not apply LaunchServices environment settings. The constructor
removes its own loader entry from the process environment before Chromium starts
children, preserving any unrelated entries. Existing app signing protections and
entitlements are preserved. A native update requires the app to be stopped.

Tests: `node --test tests/unit/native_sequences.test.js tests/unit/native_shortcuts.test.js`
and `python3 -m unittest discover -s tests/unit -p 'test_native_shortcuts_install.py'`.
The native tests replay the duplicated physical events that exposed the first
integration bug. No native unit test posts keyboard input.
