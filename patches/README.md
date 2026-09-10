# Draggable list browser compatibility

`react-native-draggable-flatlist` is pinned to 4.0.3. The root `postinstall`
applies its patch with `patch-package --error-on-fail`.

The patch fixes two browser issues in the source and ESM entry points used by
Expo/Metro:

- React Native Web measures cells relative to the visible container. Add the
  vertical scroll offset, as the library already does for horizontal lists,
  so editing or reordering in a scrolled list preserves correct drop targets.
- Disable the browser scroll recognizer while a card is held. Disabling only
  `scrollEnabled` leaves that recognizer able to interrupt a quick drag before
  the list's pan gesture activates.

Both corrections are conditional on web; native gesture behavior is unchanged
by the patch. The browser regression test covers continuous movement, repeated
drags, variable card heights, edge scrolling, keyboard ordering, draft restoration
and saved exercise data. Recheck that test before upgrading or removing the patch.
