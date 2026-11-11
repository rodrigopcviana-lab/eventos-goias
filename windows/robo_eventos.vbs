' Robo de eventos de Goias (Agendador de Tarefas "Eventos Goias - robo diario").
' Roda robo_eventos.py com o Python do .venv da propria pasta, sem abrir janela,
' e espera terminar. Log em logs\robo_eventos.log; resultado em saida\status.json.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = raiz
sh.Run """" & raiz & "\.venv\Scripts\pythonw.exe"" """ & raiz & "\robo_eventos.py""", 0, True
