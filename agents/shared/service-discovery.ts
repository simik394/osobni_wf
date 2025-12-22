/**
 * Service Discovery
 * 
 * Discover service addresses via Consul or Nomad.
 * Eliminates need for hardcoded environment variables.
 */

// Consul address - usually available in Nomad jobs via bridge network
const CONSUL_ADDR = process.env.CONSUL_ADDR || 'http://consul.service.consul:8500';
const NOMAD_ADDR = process.env.NOMAD_ADDR || 'http://nomad.service.consul:4646';

// Service name mapping
export const SERVICES = {
    'rsrch-browser': { port: 'cdp', default: 'http://localhost:9223' },
    'angrav-browser': { port: 'cdp', default: 'http://localhost:9224' },
    'windmill-server': { port: 'http', default: 'http://localhost:8000' },
    'falkordb': { port: 'redis', default: 'redis://localhost:6379' },
} as const;

export type ServiceName = keyof typeof SERVICES;

interface ServiceInstance {
    address: string;
    port: number;
    healthy: boolean;
}

/**
 * Discover service via Consul
 */
async function discoverViaConsul(serviceName: string): Promise<ServiceInstance | null> {
    try {
        const response = await fetch(
            `${CONSUL_ADDR}/v1/health/service/${serviceName}?passing=true`,
            { signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) {
            return null;
        }

        const services = await response.json();

        if (services.length === 0) {
            return null;
        }

        // Pick the first healthy instance
        const svc = services[0].Service;

        return {
            address: svc.Address || services[0].Node.Address,
            port: svc.Port,
            healthy: true
        };

    } catch (error) {
        console.warn(`Consul discovery failed for ${serviceName}:`, error);
        return null;
    }
}

/**
 * Discover service via Nomad allocations (fallback)
 */
async function discoverViaNomad(jobName: string, portLabel: string): Promise<ServiceInstance | null> {
    try {
        const response = await fetch(
            `${NOMAD_ADDR}/v1/job/${jobName}/allocations`,
            { signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) {
            return null;
        }

        const allocations = await response.json();
        const running = allocations.find((a: any) => a.ClientStatus === 'running');

        if (!running) {
            return null;
        }

        // Get allocation details
        const detailResponse = await fetch(`${NOMAD_ADDR}/v1/allocation/${running.ID}`);
        const detail = await detailResponse.json();

        // Find the port
        const resources = detail.AllocatedResources?.Shared?.Networks?.[0];
        if (!resources) {
            return null;
        }

        // Check static ports first
        const staticPort = resources.ReservedPorts?.find((p: any) => p.Label === portLabel);
        if (staticPort) {
            return {
                address: resources.IP,
                port: staticPort.Value,
                healthy: true
            };
        }

        // Check dynamic ports
        const dynamicPort = resources.DynamicPorts?.find((p: any) => p.Label === portLabel);
        if (dynamicPort) {
            return {
                address: resources.IP,
                port: dynamicPort.Value,
                healthy: true
            };
        }

        return null;

    } catch (error) {
        console.warn(`Nomad discovery failed for ${jobName}:`, error);
        return null;
    }
}

/**
 * Discover a service endpoint.
 * Tries Consul first, then Nomad, then falls back to default.
 */
export async function discoverService(
    serviceName: ServiceName
): Promise<string> {
    const config = SERVICES[serviceName];

    // Try Consul first
    const consulResult = await discoverViaConsul(serviceName);
    if (consulResult) {
        const protocol = serviceName.includes('redis') ? '' : 'http://';
        console.log(`🔍 Discovered ${serviceName} via Consul: ${consulResult.address}:${consulResult.port}`);
        return `${protocol}${consulResult.address}:${consulResult.port}`;
    }

    // Try Nomad
    const nomadResult = await discoverViaNomad(serviceName, config.port);
    if (nomadResult) {
        const protocol = serviceName.includes('redis') ? '' : 'http://';
        console.log(`🔍 Discovered ${serviceName} via Nomad: ${nomadResult.address}:${nomadResult.port}`);
        return `${protocol}${nomadResult.address}:${nomadResult.port}`;
    }

    // Fallback to default
    console.warn(`⚠️ Could not discover ${serviceName}, using default: ${config.default}`);
    return config.default;
}

/**
 * Get CDP endpoint for a browser service.
 * Also resolves hostname to IP if needed (for Host header bypass).
 */
export async function getCdpEndpoint(agent: 'rsrch' | 'angrav'): Promise<string> {
    const serviceName = agent === 'rsrch' ? 'rsrch-browser' : 'angrav-browser';
    const endpoint = await discoverService(serviceName as ServiceName);

    // Resolve hostname to IP if needed
    const url = new URL(endpoint);

    if (url.hostname !== 'localhost' && !url.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        try {
            const dns = await import('node:dns');
            const { promisify } = await import('node:util');
            const lookup = promisify(dns.lookup);

            const { address } = await lookup(url.hostname);
            url.hostname = address;
            console.log(`🔍 Resolved ${endpoint} → ${url.toString()}`);
            return url.toString();
        } catch {
            // Use original if resolution fails
        }
    }

    return endpoint;
}

/**
 * Get Redis/FalkorDB endpoint for human lock
 */
export async function getRedisEndpoint(): Promise<string> {
    return discoverService('falkordb');
}

/**
 * Get Windmill server endpoint (for webhooks)
 */
export async function getWindmillEndpoint(): Promise<string> {
    return discoverService('windmill-server');
}
