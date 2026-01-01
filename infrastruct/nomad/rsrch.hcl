job "rsrch" {
  datacenters = ["oci-eu"]
  region      = "cloud"
  type        = "service"

  group "server" {
    count = 1

    constraint {
      attribute = "${node.class}"
      value     = "cloud"
    }

    network {
      mode = "host"
      port "http" {
        static = 3030
      }
    }

    task "rsrch" {
      driver = "docker"

      config {
        image        = "ghcr.io/simik394/osobni_wf/rsrch:latest"
        network_mode = "host"
        ports        = ["http"]

        mounts = [
          {
            type     = "bind"
            source   = "/opt/rsrch/secrets/auth.json"
            target   = "/secrets/auth.json"
            readonly = true
          }
        ]
      }

      env {
        PORT                 = "3030"
        DEBUG                = "rsrch:*"
        HEADLESS             = "true"
        AUTH_FILE            = "/secrets/auth.json"
        BROWSER_CDP_ENDPOINT = "http://localhost:9223"
        FALKORDB_HOST        = "localhost"
        FALKORDB_PORT        = "7687"
        
        # Langfuse Telemetry
        LANGFUSE_PUBLIC_KEY  = "pk-lf-62de1c00-beee-4519-933c-ae4ce2dafbef"
        LANGFUSE_SECRET_KEY  = "sk-lf-825cd051-6ed4-4bb1-8cb2-3576be4d48a2"
        LANGFUSE_HOST        = "http://langfuse.100.73.45.27.nip.io"
      }

      resources {
        cpu    = 300
        memory = 1024
      }

      service {
        name = "rsrch"
        port = "http"

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.rsrch.rule=Host(`rsrch.100.73.45.27.nip.io`)",
          "traefik.http.services.rsrch.loadbalancer.server.port=3030"
        ]

        # Health check disabled - CDP connection timeouts
        # check {
        #   type     = "http"
        #   path     = "/health"
        #   interval = "30s"
        #   timeout  = "5s"
        # }
      }
    }
  }
}
