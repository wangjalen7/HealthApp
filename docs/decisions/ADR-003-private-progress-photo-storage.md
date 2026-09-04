# ADR-003: Private, bounded progress-photo storage

## Status

Accepted — 2026-09-04

## Context

Progress photos are sensitive health-adjacent data and can consume storage and download bandwidth much faster than structured weight records. The feature must support camera and photo-library input, a long-lived swipeable archive, and deletion without exposing public object URLs or allowing one user to access another user's files.

## Decision

- Store photo metadata in `public.progress_photos` under row-level security and image objects in a non-public Supabase Storage bucket.
- Place every object below its owning user ID and authorize Storage reads, inserts, and deletes only when that first path segment matches `auth.uid()`.
- Use expiring one-hour signed URLs for display. Never persist public URLs.
- Re-encode selected images as JPEG without EXIF, resize the longest edge to at most 1440 px, and progressively compress toward 900 KB. Enforce a separate 2 MB ceiling in the app, metadata table, and bucket.
- Limit each user to three photos per local calendar day with unique database slots `(user_id, local_day, daily_slot)`, not only a client-side count.
- Use a new UUID object path for each upload and never overwrite an existing object. Remove the uploaded object if metadata persistence fails.
- Associate a photo with a weight sample when available, but do not require the weight row to continue existing so the photo archive has an independent lifecycle.
- Load metadata in bounded pages and render only a small image window around the currently visible photo.

## Consequences

- Photos remain private under both table and object-store policies, and a leaked display URL expires.
- Three 900 KB target images per day would use roughly 1 GB in about one year at the maximum rate; one photo per week lasts roughly two decades before reaching that amount. Actual consumption varies with image complexity, and the 2 MB ceiling is a safety bound rather than the expected size.
- Removing EXIF protects location/device metadata and reduces size, but the app cannot later recover that metadata or the original-resolution image.
- A new native development build is required because the camera/library picker and image manipulator are native Expo modules.

## References

- <https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/>
- <https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/>
- <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- <https://supabase.com/docs/guides/storage/security/access-control>
- <https://supabase.com/docs/guides/storage/uploads/standard-uploads>
