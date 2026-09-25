# Sustain authentication email

`confirm-signup.html` is the prepared source for the hosted **Confirm sign up** email. It is not yet live.

- Subject: **Verify your Sustain account**
- Heading and action: **Verify your account**
- Project: the repository's linked HealthHub development project.
- Apply in Supabase Dashboard > Authentication > Email Templates > Confirm sign up, or through the [Management API](https://supabase.com/docs/guides/auth/auth-email-templates).
- Update only `mailer_subjects_confirmation` and `mailer_templates_confirmation_content`. This template does not change sender/SMTP configuration, recovery emails, confirmation requirements or redirect allowlists.

Keep `{{ .ConfirmationURL }}` in both links and the fallback text. Supabase substitutes the actual verification URL, preserving the signup request's approved app redirect. Do not substitute a preview URL or a static app deep link. The current mobile flow asks the user to return to Sustain and sign in after verification.

The HTML uses presentation tables, inline styles, system fonts and the existing Sustain palette. It has no remote images, tracking resources, custom font dependency, JavaScript or forms. The text brand remains visible when a mail client blocks images. Outlook desktop gets a fixed-width wrapper and button padding fallback; the layout otherwise fits narrow screens. Some mail clients may alter colors or corner rendering.

Before applying, render a local copy with a synthetic URL at 640, 390 and 320 pixels; inspect layout and verify both links. Afterwards, read the hosted configuration back and compare its two fields with this source and subject. Preserve prior values for rollback without writing access tokens or unrelated auth configuration to disk. Sending a live test email is a separate action.

Publishing was blocked on 2026-09-25: the Supabase Management API rejects email-template modifications for this Free-tier project while it uses the default email provider. It requires a plan upgrade or custom SMTP. The existing live subject remains `Confirm your email address` and the original simple template remains active. Do not report this file as deployed until the API update succeeds and readback matches. No billing or SMTP changes were made.

Once that prerequisite is resolved, publishing this template does not require an app rebuild. Only newly generated signup emails will use the updated template.
