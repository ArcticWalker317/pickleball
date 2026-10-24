// App shell (shared). Each screen is owned by one track — see CLAUDE.md.
import { Calibrate } from './Calibrate';
import { Home } from './Home';
import { Live } from './Live';
import { PostGame } from './PostGame';
import { useRoute } from './router';

export function App() {
  const route = useRoute();
  switch (route.path) {
    case '/calibrate':
      return <Calibrate />;
    case '/live':
      return <Live params={route.params} />;
    case '/post':
      return <PostGame params={route.params} />;
    default:
      return <Home />;
  }
}
