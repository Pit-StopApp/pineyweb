-- Mark all prospects with duplicate emails as emailed
-- if any prospect sharing that email has already been emailed
UPDATE pineyweb_prospects p1
SET emailed_at = NOW()
WHERE email IS NOT NULL
AND email IN (
  SELECT email FROM pineyweb_prospects
  WHERE emailed_at IS NOT NULL
)
AND emailed_at IS NULL;
