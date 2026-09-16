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
- Limit attachments to three per weight entry, independent of the upload date and other entries. Migration 202609160001 replaces the former daily-slot uniqueness constraint with a counting trigger that serializes uploads for the same user/entry using a transaction advisory lock. The legacy daily_slot field remains inert metadata with a default; existing records are preserved, including unlinked or over-limit groups. New uploads require a weight ID and groups already at or above three cannot accept more until photos are deleted.
- Use a new UUID object path for each upload and never overwrite an existing object. Remove the uploaded object if metadata persistence fails.
- Require a weight sample ID for new photos, but do not require the weight row to continue existing so previously saved photos retain an independent lifecycle.
- A Weight History popup shows only photos whose weight_sample_id matches that specific entry. Its capacity display counts only attachments to that entry, including photos uploaded on earlier dates. Do not infer attachments from dates or substitute the global archive when an entry has no photos.
- Load metadata in bounded pages and render only a small image window around the currently visible photo.

## Consequences

- Photos remain private under both table and object-store policies, and a leaked display URL expires.
- Capacity is per entry, so storage use depends on the number of entries and attachments rather than a daily photo quota. Compression and the 2 MB per-photo ceiling remain in effect.
- Removing EXIF protects location/device metadata and reduces size, but the app cannot later recover that metadata or the original-resolution image.
- A new native development build is required because the camera/library picker and image manipulator are native Expo modules.

## References

- <https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/>
- <https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/>
- <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- <https://supabase.com/docs/guides/storage/security/access-control>
- <https://supabase.com/docs/guides/storage/uploads/standard-uploads>
