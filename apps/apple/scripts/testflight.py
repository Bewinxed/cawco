"""Mac-side TestFlight workflow. Uses the existing local asc.py credential store."""
import datetime
import fcntl
import json
import os
import pathlib
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse

HOME = pathlib.Path.home()
ROOT = HOME / "build/cawco-testflight"
TEAM = "FN5LJSPX2R"

# One App Store record (6819139448, a universal purchase) ships both: the
# iPhone/iPad build and, with --mac, the Mac Catalyst build. Each has its own
# archive destination, App Store profiles and TestFlight build train
# (`preReleaseVersion.platform`). The Mac's App Store package is signed by the
# "3rd Party Mac Developer Installer" identity (a Mac Installer Distribution
# certificate in anbar-ci).
PLATFORMS = {
    "ios": {
        "asc": "IOS",
        "destination": "generic/platform=iOS",
        "profiles": {"dev.cawco.app": "CawCo App Store 20261007", "dev.cawco.app.NotificationService": "CawCo NotificationService App Store 20261009"},
        "installer": None,
    },
    "mac": {
        "asc": "MAC_OS",
        "destination": "generic/platform=macOS,variant=Mac Catalyst",
        "profiles": {"dev.cawco.app": "CawCo Mac Catalyst App Store 20261009", "dev.cawco.app.NotificationService": "CawCo NotificationService Mac Catalyst App Store 20261009"},
        "installer": "3rd Party Mac Developer Installer",
    },
}


def archive_command(platform, number, derived, archive):
    # The committed pins alone (build-both.sh's header): resolution off, so a
    # shipped build compiles the packages apps/apple/Package.resolved names.
    return ["xcodebuild", "-project", "CawCo.xcodeproj", "-scheme", "CawCo", "-configuration", "Release", "-destination", PLATFORMS[platform]["destination"], "-skipPackagePluginValidation", "-disableAutomaticPackageResolution", "-derivedDataPath", str(derived), "-archivePath", str(archive), f"CURRENT_PROJECT_VERSION={number}", "clean", "archive"]


def export_options(platform):
    options = {"method": "app-store-connect", "destination": "upload", "teamID": TEAM, "uploadSymbols": True, "signingStyle": "manual", "signingCertificate": "Apple Distribution", "manageAppVersionAndBuildNumber": False, "provisioningProfiles": PLATFORMS[platform]["profiles"]}
    if PLATFORMS[platform]["installer"]:
        options["installerSigningCertificate"] = PLATFORMS[platform]["installer"]
    return options


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


def builds(app, platform=None):
    """The app's builds, newest first: one platform's train, or every platform's
    (build numbers are picked against all of them, so a number names one build)."""
    train = f"&filter[preReleaseVersion.platform]={PLATFORMS[platform]['asc']}" if platform else ""
    return listed(f"/v1/builds?filter[app]={app}{train}&sort=-uploadedDate&limit=200")


def group(app):
    groups = listed(f"/v1/apps/{app}/betaGroups?limit=200")
    return next((g for g in groups if g["attributes"]["isInternalGroup"] and g["attributes"]["name"] == "Internal"), None)


def plain(text):
    """whatsNew is plain text: a markdown section heading (docs/releases/README.md,
    `### New`) becomes its words and a colon (`New:`), and the `- ` bullets under
    it stay as they are. App Store Connect also rejects some glyphs - 0.1.11's
    notes carry U+2715 - so fold the few we use to words and drop the rest,
    keeping the ordinary typography it does accept."""
    text = "\n".join(heading(line) for line in text.splitlines())
    for glyph, replacement in {"✕": "x", "✖": "x", "✓": "yes", "✔": "yes", "↑": "Up", "↓": "Down", "←": "Left", "→": "Right"}.items():
        text = text.replace(glyph, replacement)
    keep = " -–—''\"“”‘’…·()[]{},.:;!?/&%$#@+=*<>|~^`"
    return "".join(char for char in text if char.isascii() or char in keep)


def heading(line):
    """A markdown heading line as a plain one: `### Fixed` reads `Fixed:`."""
    match = re.match(r"\s{0,3}#{1,6}\s+(.*?)[\s#]*$", line)
    return f"{match.group(1).rstrip(':')}:" if match else line


def read_notes(path):
    """A build's own end-user notes (docs/releases/README.md), read before any work starts."""
    text = plain(pathlib.Path(path).read_text().strip())
    if not text:
        raise RuntimeError(f"Notes file {path} is empty")
    return text


def set_whats_new(build, notes, commit):
    """Writes the build's en-US What to Test and prints App Store Connect's answer.
    Its last line names the commit the build was archived from (testflight.sh
    tags the same commit `testflight-<platform>-<build>`)."""
    notes = f"{notes}\n\nBuild {build['attributes']['version']} from commit {commit[:12]}"
    localizations = listed(f"/v1/builds/{build['id']}/betaBuildLocalizations")
    english = next((row for row in localizations if row["attributes"]["locale"] == "en-US"), None)
    if english is None:
        answer = api("POST", "/v1/betaBuildLocalizations", {"data": {"type": "betaBuildLocalizations", "attributes": {"locale": "en-US", "whatsNew": notes}, "relationships": {"build": relationship("builds", build["id"])}}})
    else:
        answer = api("PATCH", f"/v1/betaBuildLocalizations/{english['id']}", {"data": {"type": "betaBuildLocalizations", "id": english["id"], "attributes": {"whatsNew": notes}}})
    row = answer["data"]
    print(f"WHATS_NEW {build['attributes']['version']} {row['id']} {row['attributes']['locale']}\n{row['attributes']['whatsNew']}")


def status(app, platform):
    available = builds(app, platform)
    if not available:
        raise RuntimeError(f"MISSING {PLATFORMS[platform]['asc']} build")
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
    print(f"IN_BETA_GROUP {PLATFORMS[platform]['asc']} {version} ({latest['attributes']['version']})")


def await_build(app, number, platform):
    """Wait for an uploaded build to finish processing, so an interrupted run can
    pick up where it stopped instead of burning another build number."""
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        build = next((b for b in builds(app, platform) if b["attributes"]["version"] == number), None)
        state = build["attributes"]["processingState"] if build else "NOT_YET_VISIBLE"
        print(f"PROCESSING {number} {state}", flush=True)
        if state == "VALID":
            return build
        if state in ["FAILED", "INVALID"]:
            raise RuntimeError(f"Build {number} processingState {state}")
        time.sleep(20)
    raise RuntimeError(f"Build {number} not VALID after 30 minutes")


def expire(app, number, platform):
    """Ends testing of one build ("Expire a build", PATCH /v1/builds/{id}): no
    tester can install it from now on."""
    build = next((b for b in builds(app, platform) if b["attributes"]["version"] == number), None)
    if build is None:
        raise RuntimeError(f"MISSING {PLATFORMS[platform]['asc']} build {number}")
    answer = api("PATCH", f"/v1/builds/{build['id']}", {"data": {"type": "builds", "id": build["id"], "attributes": {"expired": True}}})
    print(f"EXPIRED {PLATFORMS[platform]['asc']} {number} {answer['data']['attributes']['expired']}")


def finish(app, build, notes, platform, commit):
    """Everything ship() does once a build is VALID: tester, notes, beta group."""
    internal = group(app)
    if internal is None:
        internal = api("POST", "/v1/betaGroups", {"data": {"type": "betaGroups", "attributes": {"name": "Internal", "isInternalGroup": True}, "relationships": {"app": relationship("apps", app)}}})["data"]
    testers = listed("/v1/betaGroups/18bd36fb-1016-42b2-bc5a-e080c46f1c23/betaTesters?limit=200")
    owner = next(t for t in testers if t["id"] == "7ca9213a-a5dd-4a65-a37d-927043b3780e")
    members = listed(f"/v1/betaGroups/{internal['id']}/betaTesters?limit=200")
    if not any(t["attributes"]["email"] == owner["attributes"]["email"] for t in members):
        api("POST", "/v1/betaTesters", {"data": {"type": "betaTesters", "attributes": {key: owner["attributes"][key] for key in ["email", "firstName", "lastName"]}, "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": internal["id"]}]}}}})
    set_whats_new(build, notes, commit)
    api("POST", f"/v1/betaGroups/{internal['id']}/relationships/builds", {"data": [{"type": "builds", "id": build["id"]}]})
    print(f"APP_ID {app} GROUP_ID {internal['id']} BUILD_ID {build['id']}")
    status(app, platform)


def signed(command, log):
    # Unlock and sign inside the same process invocation (scripts/signed.sh,
    # which build-both.sh's signing builds run too). Never print the password.
    script = ROOT / "source/apps/apple/scripts/signed.sh"
    with log.open("w") as output:
        result = subprocess.run(["/bin/bash", str(script), *command], stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        errors = [line for line in log.read_text(errors="replace").splitlines() if "error:" in line or "FAILED" in line or "errSecInternalComponent" in line]
        print("\n".join(errors), file=sys.stderr)
        raise RuntimeError(f"{' '.join(command)} exited {result.returncode}; log: {log}")
    for line in log.read_text(errors="replace").splitlines():
        if "SUCCEEDED" in line or "Upload succeeded" in line or "warning:" in line or "ITMS-" in line:
            print(line)


def next_number(used):
    """Today's build number: `yyyymmdd`, then `.2`, `.3`, past every number the app has used."""
    today = datetime.date.today().strftime("%Y%m%d")
    suffixes = [1 if v == today else int(v.split(".")[1]) for v in used if v == today or (v.startswith(today + ".") and v.split(".")[1].isdigit())]
    return today if not suffixes else f"{today}.{max(suffixes) + 1}"


def ship(app, mode, notes, platform, commit):
    """mode is "archive" (archive only) or "upload-archive" (upload the kept
    archive): testflight.sh records the archive's build number between the two."""
    ROOT.mkdir(parents=True, exist_ok=True)
    # Concurrent uploads must not reuse the same build number or archive. The kernel
    # holds the lock for this process and lets it go when the process ends, however it
    # ends, so a killed upload never leaves one behind.
    lock = (ROOT / ".upload.lock").open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise RuntimeError("Another TestFlight archive or upload is running on this Mac") from None
    try:
        used = [b["attributes"]["version"] for b in builds(app)] if app else []
        number = next_number(used)
        source = ROOT / "source/apps/apple"
        # Each platform keeps its own archive, DerivedData, export and logs.
        work = ROOT / platform
        work.mkdir(exist_ok=True)
        archive = work / "CawCo.xcarchive"
        derived = work / "DerivedData"
        existing = mode == "upload-archive"
        if existing:
            number = plistlib.loads((archive / "Info.plist").read_bytes())["ApplicationProperties"]["CFBundleVersion"]
            if number in used:
                raise RuntimeError(f"Archive build {number} already exists in App Store Connect")
        else:
            os.chdir(source)
            subprocess.run(["/opt/homebrew/bin/xcodegen", "generate", "--quiet"], check=True)
            # The commit's pins, where Xcode reads them in the generated project.
            pins = source / "CawCo.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
            pins.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / "Package.resolved", pins / "Package.resolved")
            for path in [archive, derived, work / "export"]:
                if path.exists():
                    shutil.rmtree(path)
        print(f"BUILD_NUMBER {PLATFORMS[platform]['asc']} {number}", flush=True)
        if not existing:
            signed(archive_command(platform, number, derived, archive), work / "archive.log")
            archived_number = plistlib.loads((archive / "Info.plist").read_bytes())["ApplicationProperties"]["CFBundleVersion"]
            if archived_number != number:
                raise RuntimeError(f"Archive build number {archived_number} does not match requested {number}")
            # Each build's dSYMs outlive the archive the next upload replaces:
            # scripts/apple-diagnostics.sh symbolicates a phone's hang with them.
            kept = HOME / "build/cawco-dsyms" / number
            if kept.exists():
                shutil.rmtree(kept)
            shutil.copytree(archive / "dSYMs", kept)
        if mode == "archive":
            return
        options = work / "ExportOptions.plist"
        options.write_bytes(plistlib.dumps(export_options(platform)))
        identifiers = {}
        for line in (HOME / ".appstoreconnect/anbar.env").read_text().splitlines():
            if "=" in line:
                key, value = line.removeprefix("export ").split("=", 1)
                identifiers[key.strip()] = value.strip().strip("\"'")
        key_id = next(v for k, v in identifiers.items() if k.endswith("KEY_ID"))
        issuer = next(v for k, v in identifiers.items() if k.endswith("ISSUER_ID"))
        signed(["xcodebuild", "-exportArchive", "-archivePath", str(archive), "-exportOptionsPlist", str(options), "-exportPath", str(work / "export"), "-authenticationKeyPath", str(HOME / f".appstoreconnect/private_keys/AuthKey_{key_id}.p8"), "-authenticationKeyID", key_id, "-authenticationKeyIssuerID", issuer], work / "upload.log")
        build = await_build(app, number, platform)
        finish(app, build, notes, platform, commit)
    finally:
        lock.close()


USAGE = "usage: testflight.py [--mac] --archive | --upload-archive --notes <file> --commit <sha> | --status | --attach <build> --notes <file> --commit <sha> | --set-notes <build> <file> --commit <sha> | --expire <build> | --dry-run"


def take(args, flag):
    """`flag <value>` taken off the arguments: (the rest, the value or None)."""
    if flag not in args:
        return args, None
    at = args.index(flag)
    if at + 1 >= len(args):
        raise RuntimeError(USAGE)
    return args[:at] + args[at + 2:], args[at + 1]


def options(args):
    """Splits `--mac`, `--notes <file>` and `--commit <sha>` off the arguments; the rest name the command."""
    platform = "mac" if "--mac" in args else "ios"
    args = [a for a in args if a != "--mac"]
    args, notes = take(args, "--notes")
    args, commit = take(args, "--commit")
    if commit is not None and not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError(f"--commit takes a full commit id, not {commit}")
    return args, (read_notes(notes) if notes else None), platform, commit


def dry_run(platform):
    """What a run on this platform would archive, export and look up, without
    a key, a keychain or App Store Connect: the build number is today's first."""
    number = next_number([])
    work = ROOT / platform
    print(f"BUILD_NUMBER {PLATFORMS[platform]['asc']} {number} (before App Store Connect's used numbers)")
    print("ARCHIVE " + " ".join(archive_command(platform, number, work / "DerivedData", work / "CawCo.xcarchive")))
    print("EXPORT_OPTIONS\n" + plistlib.dumps(export_options(platform)).decode())
    print(f"BUILDS /v1/builds?filter[app]=<app>&filter[preReleaseVersion.platform]={PLATFORMS[platform]['asc']}&sort=-uploadedDate&limit=200")


def needs(notes):
    if notes is None:
        raise RuntimeError("TestFlight builds need end-user notes: --notes <file>")
    return notes


def named(commit):
    """Every build's notes name its commit (testflight.sh passes the one it archived or tagged)."""
    if commit is None:
        raise RuntimeError("A build's notes name its commit: --commit <sha>")
    return commit


try:
    command, notes, platform, commit = options(sys.argv[1:])
    if command == ["--dry-run"]:
        dry_run(platform)
        sys.exit(0)
    # Signing keys and App Store Connect credentials never reach a CawCo workspace.
    if os.environ.get("CAWCO_WORKSPACE"):
        sys.exit("Signed builds, device builds and TestFlight run from the orchestrator's shell, not a CawCo workspace: hand the commit to your parent.")
    # Every upload carries its own notes and commit: refuse before touching App Store Connect.
    if command == ["--upload-archive"] or command[:1] == ["--attach"]:
        needs(notes)
        named(commit)
    apps = listed("/v1/apps?filter[bundleId]=dev.cawco.app&limit=200")
    if len(apps) != 1 and command != ["--archive"]:
        raise RuntimeError("MISSING CawCo app record (create CawCo, cawco-ios, en-US in App Store Connect)")
    app = apps[0]["id"] if apps else None
    if command == ["--status"]:
        status(app, platform)
    elif len(command) == 2 and command[0] == "--attach":
        finish(app, await_build(app, command[1], platform), needs(notes), platform, named(commit))
    elif len(command) == 3 and command[0] == "--set-notes":
        build = next((b for b in builds(app, platform) if b["attributes"]["version"] == command[1]), None)
        if build is None:
            raise RuntimeError(f"MISSING {PLATFORMS[platform]['asc']} build {command[1]}")
        set_whats_new(build, read_notes(command[2]), named(commit))
    elif len(command) == 2 and command[0] == "--expire":
        expire(app, command[1], platform)
    elif command == ["--upload-archive"]:
        ship(app, "upload-archive", needs(notes), platform, named(commit))
    elif command == ["--archive"]:
        ship(app, "archive", None, platform, None)
    else:
        raise RuntimeError(USAGE)
except (RuntimeError, OSError, subprocess.CalledProcessError, StopIteration) as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
