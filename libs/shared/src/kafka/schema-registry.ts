import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';

export const registry = new SchemaRegistry({
  host: process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081',
});
