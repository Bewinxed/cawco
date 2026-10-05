"""Mac-side TestFlight workflow. Uses the existing local asc.py credential store."""
import datetime
import json
import os
import pathlib
import plistlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse

HOME = pathlib.Path.home()
ROOT = HOME / "build/cawco-testflight"
PROFILE = "CawCo App Store 20261005"
TEAM = "FN5LJSPX2R"


def api(method, path, body=None):
    command = ["/usr/bin/python3", str(HOME / "asc.py"), method, path]
    with tempfile.TemporaryDirectory() as directory:
        if body is not None:
            payload = pathlib.Path(directory) / "body.json"
            payload.write_text(json.dumps(body))
            command.append(str(payload))
        result = subprocess.run(command, capture_output=True, text=True, check=True)
    status, _, text = result.stdout.partition("\n")
    if not status.isdigit() or not 200 <= int(status) < 300:
        raise RuntimeError(f"{method} {path}: {result.stdout} {result.stderr}")
    return json.loads(text) if text.strip() else {}


def listed(path):
    rows = []
    while path:
        response = api("GET", path)
        rows.extend(response["data"])
        following = response.get("links", {}).get("next")
        path = following.replace("https://api.appstoreconnect.apple.com", "") if following else None
    return rows


def relationship(kind, identifier):
    return {"data": {"type": kind, "id": identifier}}


def builds(app):
    return listed(f"/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=200")


def group(app):
    groups = listed(f"/v1/apps/{app}/betaGroups?limit=200")
    return next((g for g in groups if g["attributes"]["isInternalGroup"] and g["attributes"]["name"] == "Internal"), None)


def status(app):
    available = builds(app)
    if not available:
        raise RuntimeError("MISSING build")
    latest = available[0]
    state = latest["attributes"]["processingState"]
    if state != "VALID":
        raise RuntimeError(f"MISSING VALID build: {latest['attributes']['version']} is {state}")
    internal = group(app)
    if not internal:
        raise RuntimeError("MISSING internal beta group")
    members = listed(f"/v1/betaGroups/{internal['id']}/builds?limit=200")
    if not any(b["id"] == latest["id"] for b in members):
        raise RuntimeError("MISSING newest build in internal beta group")
    version = api("GET", f"/v1/builds/{latest['id']}/preReleaseVersion")["data"]["attributes"]["version"]
    print(f"IN_BETA_GROUP {version} ({latest['attributes']['version']})")


def signed(command, log):
    # Unlock and sign inside the same process invocation. Never print the password.
    shell = 'security unlock-keychain -p "$(< "$HOME/.appstoreconnect/ci-keychain")" "$HOME/Library/Keychains/anbar-ci.keychain-db" && exec "$@"'
    with log.open("w") as output:
        result = subprocess.run(["/bin/bash", "-c", shell, "--", *command], stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        errors = [line for line in log.read_text(errors="replace").splitlines() if "error:" in line or "FAILED" in line or "errSecInternalComponent" in line]
        print("\n".join(errors), file=sys.stderr)
        raise RuntimeError(f"{' '.join(command)} exited {result.returncode}; log: {log}")
    for line in log.read_text(errors="replace").splitlines():
        if "SUCCEEDED" in line or "Upload succeeded" in line or "warning:" in line or "ITMS-" in line:
            print(line)


def ship(app):
    ROOT.mkdir(parents=True, exist_ok=True)
    lock = ROOT / ".upload-lock"
    lock.mkdir()  # Concurrent uploads must not reuse the same build number or archive.
    try:
        today = datetime.date.today().strftime("%Y%m%d")
        used = [b["attributes"]["version"] for b in builds(app)] if app else []
        suffixes = [1 if v == today else int(v.split(".")[1]) for v in used if v == today or (v.startswith(today + ".") and v.split(".")[1].isdigit())]
        number = today if not suffixes else f"{today}.{max(suffixes) + 1}"
        source = ROOT / "source/apps/apple"
        os.chdir(source)
        subprocess.run(["/opt/homebrew/bin/xcodegen", "generate", "--quiet"], check=True)
        archive = ROOT / "CawCo.xcarchive"
        derived = ROOT / "DerivedData"
        for path in [archive, derived, ROOT / "export"]:
            if path.exists():
                shutil.rmtree(path)
        print(f"BUILD_NUMBER {number}", flush=True)
        signed(["xcodebuild", "-project", "CawCo.xcodeproj", "-scheme", "CawCo", "-configuration", "Release", "-destination", "generic/platform=iOS", "-skipPackagePluginValidation", "-derivedDataPath", str(derived), "-archivePath", str(archive), f"CURRENT_PROJECT_VERSION={number}", "clean", "archive"], ROOT / "archive.log")
        if sys.argv[1:] == ["--archive"]:
            return
        options = ROOT / "ExportOptions.plist"
        options.write_bytes(plistlib.dumps({"method": "app-store-connect", "destination": "upload", "teamID": TEAM, "uploadSymbols": True, "signingStyle": "manual", "signingCertificate": "Apple Distribution", "manageAppVersionAndBuildNumber": False, "provisioningProfiles": {"dev.cawco.app": PROFILE}}))
        identifiers = {}
        for line in (HOME / ".appstoreconnect/anbar.env").read_text().splitlines():
            if "=" in line:
                key, value = line.removeprefix("export ").split("=", 1)
                identifiers[key.strip()] = value.strip().strip("\"'")
        key_id = next(v for k, v in identifiers.items() if k.endswith("KEY_ID"))
        issuer = next(v for k, v in identifiers.items() if k.endswith("ISSUER_ID"))
        signed(["xcodebuild", "-exportArchive", "-archivePath", str(archive), "-exportOptionsPlist", str(options), "-exportPath", str(ROOT / "export"), "-authenticationKeyPath", str(HOME / f".appstoreconnect/private_keys/AuthKey_{key_id}.p8"), "-authenticationKeyID", key_id, "-authenticationKeyIssuerID", issuer], ROOT / "upload.log")
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            build = next((b for b in builds(app) if b["attributes"]["version"] == number), None)
            state = build["attributes"]["processingState"] if build else "NOT_YET_VISIBLE"
            print(f"PROCESSING {number} {state}", flush=True)
            if state == "VALID":
                break
            if state in ["FAILED", "INVALID"]:
                raise RuntimeError(f"Build {number} processingState {state}")
            time.sleep(20)
        else:
            raise RuntimeError(f"Build {number} not VALID after 30 minutes")
        internal = group(app)
        if internal is None:
            internal = api("POST", "/v1/betaGroups", {"data": {"type": "betaGroups", "attributes": {"name": "Internal", "isInternalGroup": True}, "relationships": {"app": relationship("apps", app)}}})["data"]
        testers = listed("/v1/betaGroups/18bd36fb-1016-42b2-bc5a-e080c46f1c23/betaTesters?limit=200")
        owner = next(t for t in testers if t["id"] == "7ca9213a-a5dd-4a65-a37d-927043b3780e")
        api("POST", f"/v1/betaGroups/{internal['id']}/relationships/betaTesters", {"data": [{"type": "betaTesters", "id": owner["id"]}]})
        api("POST", "/v1/betaBuildLocalizations", {"data": {"type": "betaBuildLocalizations", "attributes": {"locale": "en-US", "whatsNew": "Connect to your CawCo hub and check the live fleet, sessions and transcripts.\nTry approvals, steering, workflows and configuration; report any issues."}, "relationships": {"build": relationship("builds", build["id"])}}})
        api("POST", f"/v1/betaGroups/{internal['id']}/relationships/builds", {"data": [{"type": "builds", "id": build["id"]}]})
        print(f"APP_ID {app} GROUP_ID {internal['id']} BUILD_ID {build['id']}")
        status(app)
    finally:
        lock.rmdir()


try:
    apps = listed("/v1/apps?filter[bundleId]=dev.cawco.app&limit=200")
    if len(apps) != 1 and sys.argv[1:] != ["--archive"]:
        raise RuntimeError("MISSING CawCo app record (create CawCo, cawco-ios, en-US in App Store Connect)")
    app = apps[0]["id"] if apps else None
    if sys.argv[1:] == ["--status"]:
        status(app)
    elif not sys.argv[1:] or sys.argv[1:] == ["--archive"]:
        ship(app)
    else:
        raise RuntimeError("usage: testflight.py [--status]")
except (RuntimeError, OSError, subprocess.CalledProcessError, StopIteration) as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
