' Lance server.js sans aucune fenetre visible.
' Appele par obs_twitch_kit.lua : wscript n'a pas de console, et Run avec le
' style 0 masque celle du cmd, donc node tourne dans une console cachee bien a lui
' (avec "start /B" il heritait de celle d'OBS, qui restait affichee).
' Fichier volontairement sans accents : wscript lit les .vbs en encodage ANSI.

Option Explicit

Dim shell, fso, root, node, cmd

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

' dossier de ce script : la racine du projet (server.js est dans src\)
root = fso.GetParentFolderName(WScript.ScriptFullName)

' le log part dans data\, qui n'existe pas encore au tout premier lancement
If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")

' le zip de release embarque node.exe dans runtime\ ; sinon (developpement),
' celui du PATH
If fso.FileExists(root & "\runtime\node.exe") Then
  node = root & "\runtime\node.exe"
Else
  node = "node"
End If

cmd = "cmd /c """"" & node & """ """ & root & "\src\server.js"" >> """ & root & "\data\server.log"" 2>&1"""

' 0 = fenetre masquee, False = ne pas attendre la fin
shell.Run cmd, 0, False
