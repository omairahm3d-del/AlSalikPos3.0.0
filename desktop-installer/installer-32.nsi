; Al Salik POS — Windows 32-bit Installer (Windows 7 SP1 compatible)
; Publisher: Al Salik Computers
; Target:    Windows 7 SP1 + Platform Update and later, 32-bit

Unicode True

!define APP_NAME      "Al Salik POS"
; APP_VERSION is injected at build time via: makensis /DAPP_VERSION=<version>
; Set the version in desktop-installer/package.json — that is the single source of truth.
!ifndef APP_VERSION
  !error "APP_VERSION must be defined. Run: npm run build:installer-32 (not makensis directly)."
!endif
!define PUBLISHER     "Al Salik Computers"
!define APP_ID        "com.alsalikcomputers.pos"
; $PROGRAMFILES32 = "C:\Program Files" on 32-bit Windows,
;                   "C:\Program Files (x86)" on 64-bit Windows
!define INSTALL_DIR   "$PROGRAMFILES32\Al Salik Computers\Al Salik POS"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define APP_EXE       "Al Salik POS.exe"

!include "MUI2.nsh"
!include "FileFunc.nsh"

; General
Name          "${APP_NAME}"
OutFile       "dist-32\Al Salik POS Setup ${APP_VERSION} (32-bit).exe"
InstallDir    "${INSTALL_DIR}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel admin

; MUI Settings
!define MUI_ABORTWARNING
!define MUI_ICON       "assets\icon.ico"
!define MUI_UNICON     "assets\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
!define MUI_FINISHPAGE_RUN          "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT     "Launch Al Salik POS"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ─── Installer ───────────────────────────────────────────────
Section "Install" SecInstall
  ; Close any running instance so we can overwrite locked files
  DetailPrint "Closing any running ${APP_NAME} instance..."
  nsExec::Exec 'taskkill /F /IM "Al Salik POS.exe" /T'
  Sleep 1500

  SetOutPath "$INSTDIR"
  SetOverwrite on

  ; Copy all app files from the 32-bit unpacked directory
  ClearErrors
  File /r "dist-32\win-ia32-unpacked\*.*"
  IfErrors 0 +3
    DetailPrint "Some files could not be written (in use). Try closing the app and re-running."
    MessageBox MB_ICONEXCLAMATION|MB_OK "Some files could not be installed because they were in use.$\r$\n$\r$\nPlease close ${APP_NAME} (and any open print preview windows) and run the installer again."

  ; Desktop shortcut
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  ; Start Menu
  CreateDirectory "$SMPROGRAMS\${PUBLISHER}"
  CreateShortcut  "$SMPROGRAMS\${PUBLISHER}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut  "$SMPROGRAMS\${PUBLISHER}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Registry — Add/Remove Programs entry
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayName"          "${APP_NAME}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayVersion"       "${APP_VERSION}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "Publisher"            "${PUBLISHER}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "InstallLocation"      "$INSTDIR"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "UninstallString"      '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayIcon"          '"$INSTDIR\${APP_EXE}"'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "EstimatedSize"        "$0"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify"             1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair"             1
SectionEnd

; ─── Uninstaller ─────────────────────────────────────────────
Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${PUBLISHER}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${PUBLISHER}\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${PUBLISHER}"
  RMDir /r "$INSTDIR"
  ; Remove app data so a fresh reinstall starts with a clean database
  RMDir /r "$APPDATA\Al Salik POS"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
