import { route } from '../../lib/http.js';
import { endSession } from '../../lib/auth.js';

export default route(['POST'], async (req, res) => {
  endSession(res);
  res.json({ ok: true });
});
