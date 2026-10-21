#!/usr/bin/env python3
"""Build a Chrome Web Store ZIP from an explicit runtime-file allowlist."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
manifest = json.loads((SOURCE / "manifest.json").read_text())
# Development keeps localhost support; the distributed package does not.
manifest["host_permissions"] = [
    "https://meet.google.com/*",
    "https://smart-noting.vercel.app/*",
    "https://noting.io.vn/*",
    "https://asr-live.noting.io.vn/*",
]
manifest["externally_connectable"]["matches"] = [
    "https://smart-noting.vercel.app/*", "https://noting.io.vn/*"
]
manifest["homepage_url"] = "https://smart-noting.vercel.app/extension"
files = sorted((SOURCE / "src").glob("*.js")) + sorted((SOURCE / "src").glob("*.html"))
files += [SOURCE / "icons" / f"icon{size}.png" for size in (16, 48, 128)]
out = ROOT / "artifacts" / "chrome-web-store"
out.mkdir(parents=True, exist_ok=True)
target = out / f"eznoting-{manifest['version']}.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for file in files:
        archive.write(file, file.relative_to(SOURCE))
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert "manifest.json" in archive.namelist()
    assert all(not name.startswith("/") and ".." not in name.split("/") for name in archive.namelist())
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(out / (target.name + ".sha256")).write_text(f"{digest}  {target.name}\n")
print(f"ZIP: {target}\nFiles: {len(files) + 1}\nSHA256: {digest}")
