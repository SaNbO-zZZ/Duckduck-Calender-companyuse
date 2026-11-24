import os
from pathlib import Path
import stat
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from import_miaoda import run_psql


class ImportConnectionTest(unittest.TestCase):
    def test_uri_passes_decoded_credentials_privately_to_psql(self):
        service_path = None

        def inspect(args, *, env, input, **kwargs):
            nonlocal service_path
            self.assertEqual(args[-2:], ["-d", "postgresql://db.example.test:5432/calendar?service=ducky_import"])
            self.assertEqual(env["PGUSER"], "operator")
            self.assertEqual(env["PGPASSWORD"], " fixture@pass ")
            self.assertNotIn("DATABASE_URL", env)
            self.assertEqual(input, "SELECT 1")
            service_path = Path(env["PGSERVICEFILE"])
            self.assertEqual(stat.S_IMODE(service_path.stat().st_mode), 0o600)
            self.assertIn("sslmode=verify-full", service_path.read_text())
            self.assertNotIn("fixture", service_path.read_text())

        with patch("subprocess.run", side_effect=inspect):
            run_psql("postgresql://operator:%20fixture%40pass%20@db.example.test:5432/calendar?sslmode=verify-full", "SELECT 1")
        self.assertFalse(service_path.exists())

    def test_plain_database_uses_existing_host_and_auth_settings(self):
        with patch.dict(os.environ, {"PGHOST": "local-socket"}), patch("subprocess.run") as run:
            run_psql("calendar", "SELECT 1")
        env = run.call_args.kwargs["env"]
        self.assertEqual(env["PGDATABASE"], "calendar")
        self.assertEqual(env["PGHOST"], "local-socket")


if __name__ == "__main__":
    unittest.main()
