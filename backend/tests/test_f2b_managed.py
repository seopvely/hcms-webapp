# backend/tests/test_f2b_managed.py
import unittest

from app.api.endpoints.managed import router as managed_router
from app.core.deps import require_staff_admin


class RoutesTest(unittest.TestCase):
    def test_routes_registered_admin_only(self):
        routes = {(r.path, tuple(sorted(r.methods))): r for r in managed_router.routes if r.path.startswith("/managed/f2b")}
        for path, method in [("/managed/f2b/options", "GET"), ("/managed/f2b/summary", "GET"), ("/managed/f2b/bans", "GET"),
                             ("/managed/f2b/bans/{ban_id}", "GET"), ("/managed/f2b/ai-review/cached", "GET"),
                             ("/managed/f2b/ai-review", "POST")]:
            route = routes[(path, (method,))]
            deps = [d.call for d in route.dependant.dependencies]
            self.assertIn(require_staff_admin, deps, path)

    def test_filters_body_to_filters(self):
        from app.api.endpoints.managed.f2b import FiltersBody
        f = FiltersBody(date_from="2026-10-01", date_to="2026-10-02", hour_from=22, hour_to=4, jails="sshd").to_filters()
        self.assertEqual((f.hour_from, f.hour_to, f.jails), (22, 4, ("sshd",)))
