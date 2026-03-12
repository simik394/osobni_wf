job "traefik" {
  datacenters = ["oci-eu"]
  type        = "service"

  group "traefik" {
    count = 1

    network {
      port "http" {
        static = 80
      }
      port "https" {
        static = 443
      }
      port "admin" {
        static = 8080
      }
    }

    task "traefik" {
      driver = "docker"

      constraint {
        attribute = "${node.class}"
        value     = "cloud"
      }

      config {
        image        = "traefik:v2.10"
        network_mode = "host"

        volumes = [
           "/opt/traefik/acme:/letsencrypt"
        ]

        args = [
          "--api.insecure=true",
          "--providers.consulcatalog=true",
          "--providers.consulcatalog.exposedByDefault=false",
          "--providers.consulcatalog.endpoint.address=127.0.0.1:8500",
          "--entrypoints.web.address=:80",
          "--entrypoints.websecure.address=:443",
        ]
      }

      service {
        name = "traefik"
        check {
          name     = "alive"
          type     = "tcp"
          port     = "http"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }
}
