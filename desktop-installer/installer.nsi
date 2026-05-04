; Al Salik POS — Windows Installer Script
; Publisher: Al Salik Computers

Unicode True

!define APP_NAME      "Al Salik POS"
!define APP_VERSION   "1.0.0"
!define PUBLISHER     "Al Salik Computers"
!define APP_ID        "com.alsalikcomputers.pos"
!define INSTALL_DIR   "$PROGRAMFILES64\Al Salik Computers\Al Salik POS"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define APP_EXE       "Al Salik POS.exe"

!include "MUI2.nsh"
!include "FileFunc.nsh"

; General
Name          "${APP_NAME}"
OutFile       "dist\Al Salik POS Setup ${APP_VERSION}.exe"
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
  SetOutPath "$INSTDIR"

  ; Copy all app files
  File /r "dist\win-unpacked\*.*"

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
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
