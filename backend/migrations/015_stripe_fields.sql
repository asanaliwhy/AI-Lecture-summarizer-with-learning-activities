-- Add Stripe integration fields
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255) UNIQUE;
