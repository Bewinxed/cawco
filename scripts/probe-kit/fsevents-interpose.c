/*
 * The FSEvents streams a process holds, read from the process itself
 * (fsevents.ts): loaded with DYLD_INSERT_LIBRARIES, it interposes
 * FSEventStreamCreate, Start, Stop and Invalidate and appends one line per
 * call to the file CAWCO_FSEVENTS_LOG names:
 *
 *   <pid> create <stream> \t<path> \t<path> ...
 *   <pid> start <stream>
 *   <pid> stop <stream>
 *   <pid> invalidate <stream>
 *
 * The paths are exactly the array the process handed fseventsd, so a stream
 * is live from its start until its stop or invalidate, over that path set.
 * dyld applies interposing to lookups through dlsym too, which is how Bun
 * and libuv reach CoreServices. A process whose signature refuses DYLD_
 * variables (hardened, without allow-dyld-environment-variables) loads none
 * of this and writes no line.
 */
#include <CoreServices/CoreServices.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static pthread_mutex_t writing = PTHREAD_MUTEX_INITIALIZER;

static void say(const char *verb, FSEventStreamRef stream, CFArrayRef paths) {
  const char *file = getenv("CAWCO_FSEVENTS_LOG");
  if (!file) {
    return;
  }
  pthread_mutex_lock(&writing);
  FILE *out = fopen(file, "a");
  if (out) {
    fprintf(out, "%d %s %p", getpid(), verb, (void *)stream);
    if (paths) {
      CFIndex count = CFArrayGetCount(paths);
      for (CFIndex i = 0; i < count; i++) {
        char path[4096];
        CFStringRef one = CFArrayGetValueAtIndex(paths, i);
        if (CFStringGetCString(one, path, sizeof path, kCFStringEncodingUTF8)) {
          fprintf(out, "\t%s", path);
        }
      }
    }
    fputc('\n', out);
    fclose(out);
  }
  pthread_mutex_unlock(&writing);
}

static FSEventStreamRef created(CFAllocatorRef allocator,
                                FSEventStreamCallback callback,
                                FSEventStreamContext *context,
                                CFArrayRef paths, FSEventStreamEventId since,
                                CFTimeInterval latency,
                                FSEventStreamCreateFlags flags) {
  FSEventStreamRef stream = FSEventStreamCreate(allocator, callback, context,
                                                paths, since, latency, flags);
  say("create", stream, paths);
  return stream;
}

static Boolean started(FSEventStreamRef stream) {
  Boolean ok = FSEventStreamStart(stream);
  say(ok ? "start" : "refused", stream, NULL);
  return ok;
}

static void stopped(FSEventStreamRef stream) {
  say("stop", stream, NULL);
  FSEventStreamStop(stream);
}

static void invalidated(FSEventStreamRef stream) {
  say("invalidate", stream, NULL);
  FSEventStreamInvalidate(stream);
}

#define INTERPOSE(replacement, original)                                      \
  __attribute__((used)) static struct {                                       \
    const void *replacement;                                                  \
    const void *original;                                                     \
  } interpose_##original __attribute__((section("__DATA,__interpose"))) = {   \
      (const void *)(unsigned long)&replacement,                              \
      (const void *)(unsigned long)&original};

INTERPOSE(created, FSEventStreamCreate)
INTERPOSE(started, FSEventStreamStart)
INTERPOSE(stopped, FSEventStreamStop)
INTERPOSE(invalidated, FSEventStreamInvalidate)
