job "youtrack" {
  datacenters = ["oci-eu"]
  type        = "service"

  constraint {
    attribute = "${node.class}"
    value     = "cloud"
  }

  group "youtrack" {
    count = 1

    network {
      port "http" {
        to = 8080
      }
    }

    task "youtrack" {
      driver = "docker"

      config {
        image = "jetbrains/youtrack:2025.3.114121"
        ports = ["http"]
        
        volumes = [
          "/mnt/data/youtrack/data:/opt/youtrack/data",
          "/mnt/data/youtrack/conf:/opt/youtrack/conf",
          "/mnt/data/youtrack/logs:/opt/youtrack/logs",
          "/mnt/data/youtrack/backups:/opt/youtrack/backups"
        ]
      }

      env {
        JAVA_OPTS = "-Xmx2g"
      }

      resources {
        cpu    = 1000
        memory = 4096
      }

      service {
        name = "youtrack"
        port = "http"
        tags = [
          "traefik.enable=true",
          "traefik.http.routers.youtrack.rule=Host(`youtrack.100.73.45.27.nip.io`)",
          "traefik.http.routers.youtrack.entrypoints=web"
        ]
      }
    }
  }
}
