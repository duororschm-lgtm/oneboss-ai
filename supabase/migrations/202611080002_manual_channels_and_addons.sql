-- Preserve all historical quotes/orders; new catalog applies only to new quotes.
update service_addons set name='增加产品',price_minor=99 where code='extra-product';
update service_addons set name='增加海报',price_minor=99 where code='extra-poster';
update service_addons set name='增加修改',price_minor=49 where code='extra-revision';
alter table service_orders add column payment_channel text check(payment_channel in ('wechat','alipay'));
alter table payment_attempts add column payment_channel text check(payment_channel in ('wechat','alipay'));
update payment_attempts set payment_channel='wechat' where provider='manual_verified';
update service_orders o set payment_channel='wechat' where exists(select 1 from payment_attempts a where a.order_id=o.id and a.provider='manual_verified');
-- Fail safely on existing duplicates. Operator must review; never delete or merge financial facts.
do $$ begin
 if exists(select 1 from payment_events group by order_id having count(*)>1) then
  raise exception 'PAYMENT_EVENT_DUPLICATES_REQUIRE_OWNER_REVIEW';
 end if;
end $$;
create unique index one_payment_fact_per_order on payment_events(order_id);
