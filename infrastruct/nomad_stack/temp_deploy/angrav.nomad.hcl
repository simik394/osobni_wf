job "angrav" {
    datacenters = ["oci-eu"]
    type = "service"

    group "server" {
        count = 1

        network {
            mode = "host"
            port "http" {
                static = 3031
            }
        }

        constraint {
            attribute = "${node.class}"
            value = "cloud"
        }

        task "angrav-server" {
            driver = "docker"

            config {
                image = "ghcr.io/simik394/osobni_wf/angrav:latest"
                network_mode = "host"
            }

            # Fallback: Vault integration disabled.
            env {
                PORT = "3031"
                DEBUG = "angrav:*"
                
                # Langfuse (SK missing)
                LANGFUSE_PUBLIC_KEY = "pk-lf-ce2c027a-96a0-49ea-ae5c-baa714b53aa4"
                LANGFUSE_SECRET_KEY = "" 
                LANGFUSE_HOST = "http://localhost:3200"

                # Windmill if needed? Angrav might use Windmill too? 
                # Assuming no for now based on previous files.
            }

            resources {
                cpu = 200
                memory = 512
            }

            service {
                name = "angrav-server"
                port = "http"
                tags = [
                    "angrav",
                    "api",
                    "traefik.enable=true",
                    "traefik.http.routers.angrav.rule=Host(`angrav.service.consul`)",
                ]
                check {
                    name = "http-health"
                    type = "http"
                    path = "/health"
                    interval = "10s"
                    timeout = "2s"
                }
            }
        }
    }
}
