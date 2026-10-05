#!/usr/bin/env python3
"""Runs a command under a terminal and answers "n" to every "Run that command now?" prompt.

Usage: stage2-answer-prompts.py COMMAND [ARGS...]
Prints the whole transcript, then "prompts answered: N", and exits with the command's own status.
Exits 124 (after printing the transcript) when nothing happens for 120 seconds.
"""
import sys

import pexpect

PROMPT = r"Run that command now\?"
STEP_TIMEOUT = 120

child = pexpect.spawn(sys.argv[1], sys.argv[2:], encoding="utf-8", timeout=STEP_TIMEOUT)
transcript = []
answered = 0
while True:
    try:
        which = child.expect([PROMPT, pexpect.EOF])
    except pexpect.TIMEOUT:
        transcript.append(child.before or "")
        print("".join(transcript))
        print(f"timed out after {STEP_TIMEOUT}s; prompts answered: {answered}")
        child.close(force=True)
        sys.exit(124)
    transcript.append(child.before or "")
    if which == 1:
        break
    transcript.append(child.after)
    child.sendline("n")
    answered += 1
child.close()
print("".join(transcript))
print(f"prompts answered: {answered}")
sys.exit(child.exitstatus if child.exitstatus is not None else 128 + (child.signalstatus or 0))
