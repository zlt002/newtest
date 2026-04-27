Set shell = CreateObject("WScript.Shell")
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /c cd /d """ & projectDir & """ && call stop.cmd"

exitCode = shell.Run(command, 0, True)

If exitCode <> 0 Then
  message = "Windows Lite failed to stop the local service." & vbCrLf & vbCrLf & _
            "Please try stop.cmd to see the error details."
  MsgBox message, 16, "Windows Lite"
End If
