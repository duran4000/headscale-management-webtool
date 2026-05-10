@echo off
:: Run fix-task.ps1 as Administrator
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ''%0\..ix-task.ps1'''"
