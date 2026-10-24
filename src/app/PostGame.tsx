// Track B (game & app). Placeholder from the bootstrap PR — stats + bounce heatmap go here.
export function PostGame({ params }: { params: URLSearchParams }) {
  return (
    <main className="screen">
      <h1>Post-game</h1>
      <p>Stats for match {params.get('id') ?? '—'} are coming (Track B, milestone 5).</p>
      <a className="button secondary" href="#/">
        Home
      </a>
    </main>
  );
}
