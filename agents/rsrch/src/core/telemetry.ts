import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import * as path from 'path';
import * as os from 'os';

// Custom OTLP endpoint from user configuration
const OTLP_ENDPOINT = 'http://halvarm.tail288db.ts.net:3000/api/public/otel/v1/traces';

const traceExporter = new OTLPTraceExporter({
  url: OTLP_ENDPOINT,
});

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'rsrch-cli',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.35',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  }),
  traceExporter,
});

/**
 * Initialize telemetry and handle graceful shutdown
 */
export async function initTelemetry() {
  try {
    sdk.start();
    console.log(`[Telemetry] Started. Exporting to ${OTLP_ENDPOINT}`);

    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => console.log('[Telemetry] Terminated'))
        .catch((error) => console.error('[Telemetry] Error terminating', error))
        .finally(() => process.exit(0));
    });
  } catch (error) {
    console.error('[Telemetry] Error starting SDK', error);
  }
}

export async function shutdownTelemetry() {
  await sdk.shutdown();
}
