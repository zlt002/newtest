Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverPort = "3001"
appUrl = "http://127.0.0.1:" & serverPort
appHealthUrl = appUrl & "/"
logDir = projectDir & "\logs"
logFile = logDir & "\server.log"

If Not fso.FileExists(projectDir & "\dist\index.html") Then
  MsgBox "Windows Lite failed to start." & vbCrLf & vbCrLf & _
         "Missing dist\index.html. Please use a complete release package.", _
         16, "Windows Lite"
  WScript.Quit 1
End If

If shell.Run("cmd.exe /c where node >nul 2>nul", 0, True) <> 0 Then
  MsgBox "Windows Lite failed to start." & vbCrLf & vbCrLf & _
         "Node.js was not found in PATH. Install Node.js 24 first.", _
         16, "Windows Lite"
  WScript.Quit 1
End If

If shell.Run("cmd.exe /c where powershell >nul 2>nul", 0, True) <> 0 Then
  MsgBox "Windows Lite failed to start." & vbCrLf & vbCrLf & _
         "PowerShell was not found.", _
         16, "Windows Lite"
  WScript.Quit 1
End If

If Not fso.FolderExists(logDir) Then
  fso.CreateFolder(logDir)
End If

command = "cmd.exe /c cd /d """ & projectDir & """ && set ""SERVER_PORT=" & serverPort & """ && start """" /b node server\index.js > """ & logFile & """ 2>&1"
shell.Run command, 0, False

For i = 1 To 60
  healthCommand = "powershell -NoProfile -Command ""try { Invoke-WebRequest -UseBasicParsing -Uri '" & appHealthUrl & "' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"""
  If shell.Run(healthCommand, 0, True) = 0 Then
    shell.Run appUrl, 1, False
    WScript.Quit 0
  End If

  WScript.Sleep 1000
Next

MsgBox "Windows Lite failed to start." & vbCrLf & vbCrLf & _
       "Service was not ready within 60 seconds. Check logs\server.log.", _
       16, "Windows Lite"
WScript.Quit 1
