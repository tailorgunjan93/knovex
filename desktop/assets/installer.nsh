; Knovex — custom NSIS installer/uninstaller hooks
; ============================================================================
; Fixes the recurring "Failed to uninstall old application files. ... : 2" on
; install/update.
;
; Two root causes, both addressed here:
;   1. Knovex runs a separate backend process, knovex-backend.exe (PyInstaller),
;      spawned by the Electron app. electron-builder/NSIS closes Knovex.exe but
;      not this child, so it (and the Electron app) keep image files locked.
;   2. Even after killing them, the electron-builder uninstaller aborts hard on
;      the first transiently-busy file (antivirus still scanning the ~120 freshly
;      written _internal DLLs + the 188 MB Knovex.exe), surfacing the "uninstall
;      old files: 2" dialog. Its ~5s retry budget isn't reliable here.
;
; Fix: in customInit (runs in .onInit, BEFORE uninstallOldVersion) we (a) kill the
; app + backend, then (b) remove the old install directory OURSELVES with a retry
; loop — the same operation PowerShell/Win32 DeleteFile performs reliably in
; ~2s — so by the time electron-builder's uninstaller runs there is nothing left
; for it to choke on. The same kill runs in customUnInstall for manual uninstalls.
; ============================================================================

!macro killKnovexProcesses
  DetailPrint "Closing Knovex…"
  ; Kill the Electron app FIRST (its /T tree-kill takes the child backend too and
  ; stops main.js auto-restart from respawning), then any orphaned backend.
  nsExec::Exec 'taskkill /F /T /IM Knovex.exe'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM knovex-backend.exe'
  Pop $0
  Sleep 1500
  nsExec::Exec 'taskkill /F /T /IM knovex-backend.exe'   ; catch any straggler
  Pop $0
!macroend

; Remove the old install dir ourselves, retrying while antivirus/OS release the
; just-killed image files. Guarded by Knovex.exe so we never delete an unrelated
; directory. Up to ~20s — but it normally clears in 1-2 iterations.
!macro forceRemoveOldInstall
  IfFileExists "$INSTDIR\Knovex.exe" 0 knx_rm_done
  StrCpy $R8 0
  knx_rm_loop:
    RMDir /r "$INSTDIR"
    IfFileExists "$INSTDIR\Knovex.exe" 0 knx_rm_done
    IntOp $R8 $R8 + 1
    IntCmp $R8 20 knx_rm_done
    Sleep 1000
    Goto knx_rm_loop
  knx_rm_done:
    DetailPrint "Old version cleared."
!macroend

!macro customInit
  !insertmacro killKnovexProcesses
  !insertmacro forceRemoveOldInstall
!macroend

; Uninstaller: free files before our own removal (manual uninstall + future updates).
!macro customUnInstall
  !insertmacro killKnovexProcesses
!macroend
