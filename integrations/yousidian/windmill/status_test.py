import unittest
from unittest.mock import patch, Mock
import os
import status

class TestStatusScript(unittest.TestCase):

    @patch('status.requests.get')
    def test_all_healthy(self, mock_get):
        # Mock Proxy Response
        mock_proxy_resp = Mock()
        mock_proxy_resp.status_code = 200

        # Mock YouTrack Response
        mock_yt_resp = Mock()
        mock_yt_resp.status_code = 200

        # Configure side_effect for requests.get
        def side_effect(url, **kwargs):
            if "health" in url:
                return mock_proxy_resp
            if "users/me" in url:
                return mock_yt_resp
            return Mock(status_code=404)

        mock_get.side_effect = side_effect

        os.environ["YOUSIDIAN_PROXY_URL"] = "http://localhost:8080"
        os.environ["YOUTRACK_HOST"] = "https://example.youtrack.cloud"
        os.environ["YOUTRACK_TOKEN"] = "token"

        result = status.main()

        self.assertEqual(result["proxy"], "healthy")
        self.assertEqual(result["youtrack"], "connected")
        self.assertEqual(result["overall"], "operational")

    @patch('status.requests.get')
    def test_proxy_down(self, mock_get):
        # Mock Proxy Exception
        def side_effect(url, **kwargs):
            if "health" in url:
                raise Exception("Connection refused")
            return Mock(status_code=200)

        mock_get.side_effect = side_effect

        result = status.main()

        self.assertIn("down", result["proxy"])
        self.assertEqual(result["overall"], "degraded")

if __name__ == '__main__':
    unittest.main()
