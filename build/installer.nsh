!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define DEFAULT_HOME_URL "http://kiosk.htpl.internal"

!ifndef BUILD_UNINSTALLER
  Var SkipHomeUrlPage
  Var HomeUrlDialog
  Var HomeUrlField
  Var HomeUrlValue

  !macro customInit
    StrCpy $SkipHomeUrlPage 0

    ${If} ${isUpdated}
      StrCpy $SkipHomeUrlPage 1
    ${Else}
      ReadEnvStr $0 PROGRAMDATA
      IfFileExists "$0\PLSL Kiosk\config.json" 0 +2
        StrCpy $SkipHomeUrlPage 1
    ${EndIf}
  !macroend

  !macro customPageAfterChangeDir
    Page custom HomeUrlPage HomeUrlPageLeave "Konfiguracja kiosku"
  !macroend

  Function HomeUrlPage
    ${If} $SkipHomeUrlPage == 1
      Abort
    ${EndIf}

    nsDialogs::Create 1018
    Pop $HomeUrlDialog

    ${If} $HomeUrlDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Podaj adres URL, który kiosk ma otwierać po uruchomieniu i zakończeniu sesji."
    Pop $0

    ${NSD_CreateLabel} 0 30u 100% 12u "Adres strony głównej:"
    Pop $0

    ${NSD_CreateText} 0 44u 100% 12u "${DEFAULT_HOME_URL}"
    Pop $HomeUrlField

    nsDialogs::Show
  FunctionEnd

  Function HomeUrlPageLeave
    ${NSD_GetText} $HomeUrlField $HomeUrlValue

    ${If} $HomeUrlValue == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Podaj adres URL strony głównej."
      Abort
    ${EndIf}

    StrCpy $0 $HomeUrlValue 8
    ${If} $0 == "https://"
      Return
    ${EndIf}

    StrCpy $0 $HomeUrlValue 7
    ${If} $0 == "http://"
      Return
    ${EndIf}

    MessageBox MB_OK|MB_ICONEXCLAMATION "Adres URL musi zaczynać się od http:// lub https://."
    Abort
  FunctionEnd

  !macro customInstall
    ${If} $SkipHomeUrlPage == 0
      ReadEnvStr $0 PROGRAMDATA
      CreateDirectory "$0\PLSL Kiosk"
      FileOpen $R8 "$0\PLSL Kiosk\config.json" w
      FileWrite $R8 "{$\r$\n"
      FileWrite $R8 '  "homeUrl": "$HomeUrlValue"$\r$\n'
      FileWrite $R8 "}"
      FileClose $R8
    ${EndIf}
  !macroend
!endif
