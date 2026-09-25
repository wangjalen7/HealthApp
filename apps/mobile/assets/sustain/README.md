# Sustain artwork

`approved-logo.png` is the unmodified transparent PNG supplied by the app owner on September 23, 2026. No vector master was present in the repository.

- `symbol.png`: pixel-preserving crop of the primary symbol, x=433, y=195, width=401, height=475.
- `wordmark.png`: pixel-preserving crop of the wordmark, x=257, y=708, width=738, height=175.
- `symbol-mask.png`: the symbol's exact alpha channel, with white RGB values. Used to contain the mint highlight and completed fill inside the approved silhouette.

The full-size reference is retained for provenance. No traced or substitute letterform is used. The wordmark remains stationary. The native splash uses the symbol fitted inside a 112-point square; LaunchCover uses the corresponding 401:475 aspect ratio and centered placement.

## Home Screen icon

`../icon.png` is a separate 1024x1024 opaque Home Screen asset, adapted from the small mint-on-evergreen icon in the approved board with the built-in imagegen tool on September 23, 2026. It is a generated adaptation, not a pixel-preserving crop. The existing login/splash symbol and wordmark above are unchanged. The generated square was resized to 1024x1024 and checked for fully opaque pixels; no corners are pre-rounded.

Final imagegen prompt:

> Edit target: the provided approved Sustain brand board. Produce ONE production iOS app icon, exactly 1024x1024 PNG. Isolate and faithfully enlarge the small mint-green S icon on the dark evergreen rounded-square tile near the bottom-left of the board (NOT the larger two-tone logo and NOT the separate tiny outlined mark). Preserve the small tile's exact flowing ribbon S silhouette and its soft mint shading, centered at about 60% of the canvas height. Extend its dark evergreen background to fill the ENTIRE square canvas uniformly, approximate #123D2A. This is an app icon asset, not a mockup: no rounded canvas corners, no transparent pixels, no outer margin outside the background, no typography, no wordmark, no caption, no extra symbols, no border, no drop shadow. All four canvas corners must be opaque dark evergreen. Keep the recognizable approved letterform and tasteful subtle gradient within the mint symbol. Output only the single full-bleed square icon.
