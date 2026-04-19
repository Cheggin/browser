#!/usr/bin/env bash
# python/build.sh — dual-arch PyInstaller build script.
#
# Usage:
#   ./build.sh                 # build for the current arch (local dev)
#   ARCH=x86_64 ./build.sh     # force Intel build (runs on macos-13 CI runner)
#   ARCH=arm64  ./build.sh     # force arm64  build (runs on macos-14 CI runner)
#
# The CI release workflow (release.yml) calls this script on each runner.
# Cross-compilation is NOT supported by PyInstaller — each arch must be built
# on native hardware. This matches our CI matrix (macos-13 = Intel, macos-14 = arm64).
#
# Output: python/dist/agent_daemon  (single-file executable for the target arch)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON="${PYTHON:-python3}"
ARCH="${ARCH:-$(uname -m)}"   # arm64 or x86_64

echo "[build.sh] python=$(which "$PYTHON") arch=$ARCH"
echo "[build.sh] python version: $($PYTHON --version)"

# Ensure PyInstaller is available in the active environment.
if ! "$PYTHON" -m PyInstaller --version &>/dev/null; then
    echo "[build.sh] ERROR: PyInstaller not found. Install with: pip install pyinstaller"
    echo "[build.sh] In CI this should be in requirements-build.txt"
    exit 1
fi

# Clean previous build artifacts.
rm -rf build/ dist/

echo "[build.sh] Running PyInstaller for arch=$ARCH ..."
# Use python3 -m PyInstaller (not bare `pyinstaller` binary) to avoid PATH issues
# on macOS where pip-installed scripts land in ~/Library/Python/X.Y/bin which is
# often not on PATH (e.g. macOS system Python 3.9 installed via Xcode CLT).
"$PYTHON" -m PyInstaller pyinstaller.spec \
    --distpath dist \
    --workpath build \
    --noconfirm \
    --clean

BINARY="$SCRIPT_DIR/dist/agent_daemon"

if [[ ! -f "$BINARY" ]]; then
    echo "[build.sh] ERROR: expected output binary not found at $BINARY"
    exit 1
fi

# Verify the binary is for the correct arch.
BINARY_ARCH=$(lipo -archs "$BINARY" 2>/dev/null || file "$BINARY" | grep -o 'arm64\|x86_64' | head -1)
echo "[build.sh] Binary arch: $BINARY_ARCH"

if [[ "$ARCH" == "arm64" && "$BINARY_ARCH" != *"arm64"* ]]; then
    echo "[build.sh] WARNING: requested arm64 but got $BINARY_ARCH"
fi
if [[ "$ARCH" == "x86_64" && "$BINARY_ARCH" != *"x86_64"* ]]; then
    echo "[build.sh] WARNING: requested x86_64 but got $BINARY_ARCH"
fi

echo "[build.sh] Build complete: $BINARY"
echo "[build.sh] Size: $(du -sh "$BINARY" | cut -f1)"
echo "[build.sh] Next step: run scripts/sign-python.sh before npm run make"
