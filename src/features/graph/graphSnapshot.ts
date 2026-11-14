/**
 * Lets other parts of the app (the report) ask for a picture of the graph
 * without knowing about Cytoscape. While the graph tab is open the picture is
 * taken live; when the tab is closed the last picture of that case is kept.
 */
type Snapshot = () => string | undefined;
let provider: { projectId: string; take: Snapshot } | null = null;
let last: { projectId: string; image: string } | null = null;

/** Called by the graph view while it is mounted; returns an unregister function. */
export function registerGraphSnapshot(projectId: string, take: Snapshot): () => void {
  const mine = { projectId, take };
  provider = mine;
  return () => {
    // Keep one last picture so a report can include the graph after the tab is left.
    try {
      const image = take();
      if (image) last = { projectId, image };
    } catch {
      /* graph already gone */
    }
    if (provider === mine) provider = null;
  };
}

/** PNG data URL of the whole graph of this case, or undefined if it was never opened. */
export function takeGraphSnapshot(projectId: string): string | undefined {
  try {
    if (provider?.projectId === projectId) {
      const image = provider.take();
      if (image) return image;
    }
  } catch {
    /* fall back to the kept picture */
  }
  return last?.projectId === projectId ? last.image : undefined;
}
