// Track B (game & app). Placeholder from the bootstrap PR.
export function Home() {
  return (
    <main className="screen">
      <h1>Pickleball Ref</h1>
      <p>Prop your phone up with a view of the whole court. It calls the lines and keeps score.</p>
      <a className="button" href="#/calibrate">
        New game
      </a>
      <a className="button secondary" href="#/live?source=mock">
        Demo (mock tracking)
      </a>
    </main>
  );
}
