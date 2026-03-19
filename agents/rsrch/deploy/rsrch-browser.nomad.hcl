job "rsrch-browser" {
  datacenters = ["oci-eu"]
  type        = "service"

  group "browser" {
    count = 1

    constraint {
      attribute = "${node.class}"
      value     = "cloud"
    }

    network {
      mode = "host"
      port "vnc" {
        static = 5955
      }
      port "health" {
        static = 9227
      }
      port "cdp" {
        static = 9223
      }
    }

    task "chromium" {
      driver = "docker"

      config {
        image        = "rsrch-browser:v2"
        force_pull   = false
        network_mode = "host"
        shm_size     = 1073741824

        volumes = [
          "/home/sim/.rsrch/profiles/fresh/state:/app/user-data",
        ]
      }

      env {
        USER_DATA_DIR = "/app/user-data"
        DISPLAY       = ":99"
        HEALTH_PORT   = "9227"
        PROXY_PORT    = "9223"
      }

      resources {
        cpu    = 500
        memory = 2048
      }

      service {
        name = "rsrch-browser"
        port = "cdp"
        tags = ["rsrch", "browser"]
      }
    }
  }
}
