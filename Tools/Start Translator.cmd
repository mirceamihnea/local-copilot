@echo off
setlocal
echo Starting LibreTranslate on http://127.0.0.1:5000/translate
echo.
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker was not found.
  echo Install Docker Desktop, open it, then run this file again.
  echo.
  echo Download Docker Desktop:
  echo https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)

docker run --rm -it -p 5000:5000 libretranslate/libretranslate
