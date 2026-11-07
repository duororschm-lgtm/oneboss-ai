// Reuses the local-only database guard, real Auth/worker and guaranteed user cleanup.
process.env.RUN_CREATIVE_ACCEPTANCE = 'true';
process.env.CREATIVE_ADAPTER_MODULE = 'builtin:b';
await import('./acceptance-a');
export {};
