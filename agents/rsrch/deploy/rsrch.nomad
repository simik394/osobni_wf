job "rsrch" {
  datacenters = ["oci-eu"]
  type        = "service"

  group "server" {
    count = 1

    network {
      mode = "host"
      port "http" {
        static = 3055
      }
    }

    task "server" {
      driver = "docker"

      config {
        image = "localhost:5001/rsrch:latest"
        force_pull = true
        network_mode = "host"
        
        # Use direct bind mounts as Nomad dynamic volumes are not configured
        mount {
          type     = "bind"
          source   = "/opt/rsrch/secrets/auth.json"
          target   = "/app/config/auth.json"
          readonly = false
        }

        mount {
          type     = "bind"
          source   = "/opt/rsrch/secrets/user-data"
          target   = "/secrets/user-data"
          readonly = false
        }

        mount {
          type     = "bind"
          source   = "/home/sim/.rsrch/profiles"
          target   = "/opt/rsrch/profiles"
          readonly = false
        }
      }

      env {
        FORCE_LOCAL_BROWSER = "true"
        BROWSER_CDP_ENDPOINT = "http://localhost:9222"
        PREINTI_BROWSER = "true"
        REDEPLOY_NONCE = "3"
        PORT = "${NOMAD_PORT_http}"
        DISPLAY = ":99"
        RSRCH_PROFILE_ID = "fresh"
        WINDMILL_URL = "http://localhost:8000"
        WINDMILL_WORKSPACE = "admins"
        WINDMILL_TOKEN = "wt_aec5ae03026acc90ddbc4f4714c9ed7d"
        # AUTH_FILE = "/app/config/auth.json"
        USER_DATA_DIR = "/secrets/user-data"
        PROFILES_DIR = "/opt/rsrch/profiles"
        DEBUG = "pw:browser,pw:api,rsrch:*"
      }

      resources {
        cpu    = 2000
        memory = 4096
      }

      service {
        name = "rsrch-server"
        port = "http"
        tags = [
          "rsrch",
          "api",
          "traefik.enable=true",
          "traefik.http.routers.rsrch.rule=Host(`rsrch.service.consul`)"
        ]
      }
    }
  }
}
