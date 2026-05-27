#!/usr/bin/env python3

if __name__ != "__main__":
    raise SystemExit(f'Utility script "{__file__}" should not be used as a module!')

import os
import shutil
import sys
import urllib.request
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../"))

from misc.utility.color import Ansi, color_print

# WebView2 SDK version
# Check for latest: https://www.nuget.org/packages/Microsoft.Web.WebView2
webview2_version = "1.0.3967.48"

# Base Godot dependencies path
deps_folder = os.getenv("LOCALAPPDATA")
if deps_folder:
    deps_folder = os.path.join(deps_folder, "Godot", "build_deps")
else:
    deps_folder = os.path.join("bin", "build_deps")

webview2_archive = os.path.join(deps_folder, f"WebView2_{webview2_version}.nupkg")
webview2_folder = os.path.join(deps_folder, "webview2")

if not os.path.exists(deps_folder):
    os.makedirs(deps_folder)

color_print(f"{Ansi.BOLD}Microsoft WebView2 SDK")

if os.path.isfile(webview2_archive):
    os.remove(webview2_archive)

print(f"Downloading WebView2 SDK {webview2_version} ...")
urllib.request.urlretrieve(
    f"https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/{webview2_version}",
    webview2_archive,
)

if os.path.exists(webview2_folder):
    print(f"Removing existing WebView2 SDK in {webview2_folder} ...")
    shutil.rmtree(webview2_folder)

print(f"Extracting WebView2 SDK {webview2_version} to {webview2_folder} ...")
with zipfile.ZipFile(webview2_archive, "r") as z:
    z.extractall(webview2_folder)

os.remove(webview2_archive)

# Verify expected files exist
include_dir = os.path.join(webview2_folder, "build", "native", "include")
lib_x64 = os.path.join(webview2_folder, "build", "native", "x64", "WebView2LoaderStatic.lib")
lib_arm64 = os.path.join(webview2_folder, "build", "native", "arm64", "WebView2LoaderStatic.lib")

ok = True
if not os.path.isdir(include_dir):
    color_print(f"{Ansi.RED}ERROR: Include directory not found at {include_dir}")
    ok = False
if not os.path.isfile(lib_x64):
    color_print(f"{Ansi.RED}ERROR: x64 static lib not found at {lib_x64}")
    ok = False

if ok:
    color_print(f"{Ansi.GREEN}WebView2 SDK {webview2_version} installed successfully.")
    print(f'  Include: {include_dir}')
    print(f'  Lib x64: {lib_x64}')
    if os.path.isfile(lib_arm64):
        print(f'  Lib ARM64: {lib_arm64}')
    print(f'\nAll WebView2 SDK components installed to "{webview2_folder}" successfully!')
else:
    color_print(f"{Ansi.RED}WebView2 SDK installation failed.")
    sys.exit(1)
