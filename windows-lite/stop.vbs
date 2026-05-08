Set shell = CreateObject("WScript.Shell")

serverPort = "3001"
command = "powershell -NoProfile -Command ""$conn = Get-NetTCPConnection -LocalPort " & serverPort & " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop }; exit 0"""

exitCode = shell.Run(command, 0, True)

If exitCode <> 0 Then
  MsgBox "Windows Lite failed to stop the local service on port " & serverPort & ".", _
         16, "Windows Lite"
  WScript.Quit exitCode
End If

WScript.Quit 0
