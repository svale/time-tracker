-- Add include_in_worktime flag to calendar_subscriptions (default true)
ALTER TABLE calendar_subscriptions ADD COLUMN include_in_worktime INTEGER DEFAULT 1;
