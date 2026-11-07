-- Owner-requested catalogue prices: CNY 1.99 basic / 5.99 professional.
-- Existing quotes/orders retain their immutable amount and plan snapshots.
update service_plans set price_minor=199 where code='basic';
update service_plans set price_minor=599 where code='professional';
