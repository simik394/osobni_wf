job "rsrch" {
    datacenters = ["oci-eu"]
    type = "service"

    group "server" {
        count = 1

        network {
            mode = "host"
            port "http" {
                static = 3030
            }
            port "vnc" {
                static = 5902
                to = 5900
            }
        }

        constraint {
            attribute = "${node.class}"
            value = "cloud"
        }

        task "rsrch-server" {
            driver = "docker"

            config {
                image = "ghcr.io/simik394/osobni_wf/rsrch:vnc"
                network_mode = "host"
                mounts = [
                    {
                        type = "bind"
                        target = "/secrets/auth.json"
                        source = "/opt/rsrch/secrets/auth.json"
                        readonly = true
                    }
                ]
            }

            # Fallback: Vault integration disabled due to Nomad Workload Identity issue.
            # Secrets injected directly.
            env {
                PORT = "3030"
                BROWSER_CDP_ENDPOINT = "http://localhost:9223"
                AUTH_FILE = "/secrets/auth.json"
                HEADLESS = "false" 
                DEBUG = "rsrch:*"
                FALKORDB_HOST = "localhost"
                FALKORDB_PORT = "6379"

                WINDMILL_TOKEN = "wt_aec5ae03026acc90ddbc4f4714c9ed7d"
                WINDMILL_URL = "http://localhost:8000"
                WINDMILL_WORKSPACE = "admins"
            }

            resources {
                cpu = 200
                memory = 1024
            }

            service {
                name = "rsrch-server"
                port = "http"
                tags = [
                    "rsrch",
                    "api",
                    "traefik.enable=true",
                    "traefik.http.routers.rsrch.rule=Host(`rsrch.service.consul`)",
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
