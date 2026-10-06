@echo off
REM Build AtlasSetup.exe (one file, embedded Python runtime).
REM Requires Python 3.8+ and Node.js on the BUILD machine. The output exe needs nothing.

echo [1/5] Bundling JavaScript modules...
py -3 scripts\bundle.py || goto :err

echo [2/5] Validating bundled JavaScript syntax...
node -c payload\install-files\atlas.js || goto :err

echo [3/5] Verifying PyInstaller...
py -3 -m pip install --upgrade pyinstaller || goto :err

echo [4/5] Compiling standalone executable...
py -3 -m PyInstaller --noconfirm --clean --onefile --console --name AtlasSetup ^
  --add-data "payload;payload" ^
  --collect-submodules encodings ^
  install.py || goto :err

echo [5/5] Cleaning intermediate build artifacts...
if exist build rmdir /s /q build
if exist AtlasSetup.spec del /f /q AtlasSetup.spec

echo.
echo ========================================
echo SUCCESS: Built dist\AtlasSetup.exe
echo ========================================
goto :eof

:err
echo.
echo ========================================
echo BUILD FAILED
echo ========================================
exit /b 1
