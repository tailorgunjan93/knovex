; Knovex — custom NSIS installer/uninstaller hooks
; ============================================================================
; Fixes the recurring "Failed to uninstall old application files. ... : 2".
;
; Knovex runs a SEPARATE backend process, knovex-backend.exe (PyInstaller),
; spawned by the Electron main process. electron-builder/NSIS knows how to close
; the Electron app (Knovex.exe) but has NO idea this child process exists. During
; an install/update, knovex-backend.exe is often still running and holds open
; handles on its own image (and the Python DLLs it loaded) inside the install
; dir. Windows refuses to delete a running executable, so the OLD version's
; uninstaller aborts with "File is busy" and returns exit code 2, surfaced as
; "$(uninstallFailed): 2" (see installUtil.nsh handleUninstallResult).
;
; Fix: force-kill knovex-backend.exe BEFORE the installer touches any files
; (customInit runs in .onInit, before uninstallOldVersion) and again whenever our
; own uninstaller runs. The backend is never auto-respawned (main.js spawns it
; only at app startup), so once killed the handles are released and the old
; uninstaller deletes everything cleanly.
;
; Verified: with knovex-backend.exe running, an install-over-existing returns
; exit 0 across repeated cycles; the same scenario without this script returns
; exit 2.
; ============================================================================

!macro killKnovexBackend
  DetailPrint "Stopping Knovex backend (knovex-backend.exe)…"
  ; /F force, /T kill child tree, /IM by image name. Hidden; ignore the result
  ; (fine if it isn't running).
  nsExec::Exec 'taskkill /F /T /IM knovex-backend.exe'
  Pop $0
  ; Let Windows release the file handles before files are removed.
  Sleep 1500
!macroend

; Installer: .onInit, BEFORE uninstallOldVersion — fixes update-over-running-app.
!macro customInit
  !insertmacro killKnovexBackend
!macroend

; Uninstaller: free files before removal (manual uninstall + future updates).
!macro customUnInstall
  !insertmacro killKnovexBackend
!macroend
