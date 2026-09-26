"""
CareerDesk — Enterprise Admin & Governance Verification Suite
=============================================================
Run with: python -m unittest tests/test_admin.py
"""

import sys
import os
import unittest

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from unittest.mock import patch, MagicMock
from api.index import create_app
from api.routes.admin import get_admin_metrics
from api.services.supabase_client import get_service_client


class EnterpriseAdminTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def test_public_announcement_endpoint(self):
        """Public announcement endpoint must return HTTP 200 without auth."""
        res = self.client.get("/api/announcement")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("announcement", data)

    def test_admin_metrics_route_protection(self):
        """Admin metrics route must reject unauthenticated requests with HTTP 401."""
        res = self.client.get("/api/admin/metrics")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertIn("error", data)

    @patch("api.routes.admin.get_service_client")
    def test_admin_metrics_execution(self, mock_get_client):
        """Admin metrics route logic must execute cleanly and return aggregated KPIs."""
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase

        mock_profiles_res = MagicMock()
        mock_profiles_res.data = [
            {"id": "u1", "role": "admin", "is_banned": False, "last_seen_at": "2099-01-01T00:00:00Z", "college_name": "IIT", "created_at": "2026-01-01T00:00:00Z"},
            {"id": "u2", "role": "student", "is_banned": False, "last_seen_at": "2099-01-01T00:00:00Z", "college_name": "NIT", "created_at": "2026-01-01T00:00:00Z"}
        ]
        mock_count_res = MagicMock()
        mock_count_res.count = 5
        mock_count_res.data = []

        mock_sync_res = MagicMock()
        mock_sync_res.data = [{"status": "success", "synced_count": 10}]

        def table_side_effect(table_name):
            t_mock = MagicMock()
            if table_name == "opp_profiles":
                t_mock.select.return_value.execute.return_value = mock_profiles_res
            elif table_name == "opp_sync_logs":
                t_mock.select.return_value.order.return_value.limit.return_value.execute.return_value = mock_sync_res
            else:
                t_mock.select.return_value.execute.return_value = mock_count_res
                t_mock.select.return_value.eq.return_value.execute.return_value = mock_count_res
            return t_mock

        mock_supabase.table.side_effect = table_side_effect

        with self.app.test_request_context():
            from flask import g
            g.user_id = "test-admin-id"
            g.current_user = {
                "id": "test-admin-id",
                "email": "sumayyamulla30@gmail.com",
                "role": "admin",
            }
            resp = get_admin_metrics.__wrapped__()
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertIn("metrics", data)
            metrics = data["metrics"]
            self.assertIn("total_opportunities", metrics)
            self.assertIn("total_users", metrics)
            self.assertIn("active_users_24h", metrics)


if __name__ == "__main__":
    unittest.main()
