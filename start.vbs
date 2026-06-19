Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c cd /d ""D:\Sizing-Software-Web\webapp\backend"" && python -m uvicorn main:app --host 0.0.0.0 --port 8001 >> ""D:\Sizing-Software-Web\backend.log"" 2>&1", 0, False
