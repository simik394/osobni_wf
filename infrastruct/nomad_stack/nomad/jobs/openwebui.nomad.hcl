job "openwebui" {
  datacenters = ["oci-eu"]
  type        = "service"

  group "server" {
    count = 1

    network {
      mode = "host"
      port "http" {
        static = 3080
      }
    }

    constraint {
      attribute = "${node.class}"
      value     = "cloud"
    }

    task "openwebui" {
      driver = "docker"

      config {
        image = "ghcr.io/open-webui/open-webui:main"
        network_mode = "host"
        volumes = [
          "/opt/open-webui/data:/app/backend/data"
        ]
      }

      env {
        PORT = "3080"
        
        # Multiple OpenAI-compatible backends
        # rsrch (3030) and angrav (3031)
        OPENAI_API_BASE_URLS = "http://localhost:3030/v1;http://localhost:3031/v1"
        OPENAI_API_KEYS = "dummy;dummy"
        
        # Disable built-in auth for now (as per existing setup)
        WEBUI_AUTH = "false"
        
        # Observability
        ENABLE_OPENAI_API_LOGGING = "true"
        LANGFUSE_HOST = "http://langfuse.100.73.45.27.nip.io"
        LANGFUSE_PUBLIC_KEY = "pk-lf-62de1c00-beee-4519-933c-ae4ce2dafbef"
        LANGFUSE_SECRET_KEY = "sk-lf-825cd051-6ed4-4bb1-8cb2-3576be4d48a2"
      }

      resources {
        cpu    = 200
        memory = 1024
      }

      service {
        name = "openwebui"
        port = "http"
        
        tags = [
          "openwebui",
          "ai",
          "chat",
          "traefik.enable=true",
          "traefik.http.routers.openwebui.rule=Host(`chat.130.61.225.114.nip.io`)",
          "traefik.http.routers.openwebui.entrypoints=websecure",
          "traefik.http.routers.openwebui.tls.certresolver=letsencrypt",
          "traefik.http.services.openwebui.loadbalancer.server.port=3080"
        ]
        
        check {
          name     = "http-health"
          type     = "http"
          path     = "/health"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }
}
