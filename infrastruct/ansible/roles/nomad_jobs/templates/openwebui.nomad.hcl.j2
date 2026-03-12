job "openwebui" {
  datacenters = ["oci-eu"]
  region      = "cloud"
  type        = "service"

  group "openwebui" {
    count = 1

    constraint {
      attribute = "${node.class}"
      value     = "cloud"
    }

    network {
      mode = "host"
      port "http" {
        static = 3080
      }
    }

    task "openwebui" {
      driver = "docker"

      config {
        image        = "ghcr.io/open-webui/open-webui:main"
        network_mode = "host"
        ports        = ["http"]

        volumes = [
          "/opt/open-webui/data:/app/backend/data"
        ]
      }

      env {
        PORT              = "3080"
        WEBUI_AUTH        = "false"
        OLLAMA_BASE_URL   = ""
        OPENAI_API_BASE_URL = "http://localhost:3030/v1"
        OPENAI_API_KEY    = "dummy"
        
        # Langfuse Telemetry
        ENABLE_OPENAI_API_LOGGING = "true"
        LANGFUSE_PUBLIC_KEY  = "pk-lf-62de1c00-beee-4519-933c-ae4ce2dafbef"
        LANGFUSE_SECRET_KEY  = "sk-lf-825cd051-6ed4-4bb1-8cb2-3576be4d48a2"
        LANGFUSE_HOST        = "http://langfuse.100.73.45.27.nip.io"
      }

      resources {
        cpu    = 200
        memory = 1024
      }

      service {
        name = "openwebui"
        port = "http"

        tags = [
          "traefik.enable=true",
          "traefik.http.routers.openwebui.rule=Host(`chat.100.73.45.27.nip.io`)",
          "traefik.http.services.openwebui.loadbalancer.server.port=3080"
        ]
      }
    }
  }
}
