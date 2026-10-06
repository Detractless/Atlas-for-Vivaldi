#!/usr/bin/env bash
set -e

# Build script for macOS / Linux
echo "[1/3] Bundling JavaScript modules..."
python3 scripts/bundle.py

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[2/3] Packaging standalone macOS DMG installer..."
    python3 scripts/build_dmg.py
    echo "[3/3] Ready for distribution: dist/AtlasSetup.dmg"
else
    echo "[2/3] Checking Python dependencies..."
    if python3 -m pip show pyinstaller > /dev/null 2>&1; then
        echo "[3/3] Compiling standalone executable..."
        python3 -m PyInstaller --noconfirm --clean --onefile --console --name AtlasSetup \
          --add-data "payload:payload" \
          --collect-submodules encodings \
          install.py
        [ -d build ] && rm -rf build
        [ -f AtlasSetup.spec ] && rm -f AtlasSetup.spec
        echo ""
        echo "========================================"
        echo "SUCCESS: Built dist/AtlasSetup"
        echo "========================================"
    else
        echo "[3/3] Ready to install from source: python3 install.py"
    fi
fi
