Set shell = CreateObject("WScript.Shell")
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /c cd /d """ & projectDir & """ && call start.cmd"

exitCode = shell.Run(command, 0, True)

If exitCode <> 0 Then
  message = "Windows Lite failed to start." & vbCrLf & vbCrLf & _
            "Please try start.cmd to see the error details." & vbCrLf & _
            "If a log was created, check logs\server.log."
  MsgBox message, 16, "Windows Lite"
End If
