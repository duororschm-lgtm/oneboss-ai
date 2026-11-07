// Reuses the explicit hosted opt-in, guarded demo-only grant and exact-org cleanup.
process.env.RUN_HOSTED_CUSTOMER_UI = 'true';
await import('./acceptance-hosted-write');
export {};
