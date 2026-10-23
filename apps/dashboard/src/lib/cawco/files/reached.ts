/**
 * A view of this tab had an artifact on screen, and the hub heard it
 * (PreviewPane's `artifactShown`): the artifact reached the person, so Files
 * lists it from now on. Its own module, apart from Files' store, so an
 * artifact's own tab, whose page carries no fleet, says it too and nobody
 * there listens.
 */
type Reached = (instanceId: string, id: string) => void;

const listening = new Set<Reached>();

/** Says that session `instanceId`'s artifact `id` reached the person. */
export function artifactReached(instanceId: string, id: string): void {
  for (const heard of listening) {
    heard(instanceId, id);
  }
}

/** Hears each artifact that reaches the person; the call that stops hearing. */
export function onArtifactReached(heard: Reached): () => void {
  listening.add(heard);
  return () => listening.delete(heard);
}
