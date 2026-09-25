/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module */
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const marker = "// Sustain: exclude private app data from device backups";
function addBackupExclusion(source) {
  if (source.includes(marker)) return source;
  const anchor = "    let delegate = ReactNativeDelegate()";
  if (!source.includes(anchor)) throw Error("Sustain backup protection: review the changed Expo AppDelegate template before building.");
  return source.replace(anchor, `    ${marker}
    do {
      for directory in [FileManager.SearchPathDirectory.documentDirectory, .applicationSupportDirectory] {
        var folder = try FileManager.default.url(for: directory, in: .userDomainMask, appropriateFor: nil, create: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
      }
    } catch {
      // No private data is written before this guard. Show a recoverable startup message.
      window = UIWindow(frame: UIScreen.main.bounds)
      let controller = UIViewController()
      controller.view.backgroundColor = .systemBackground
      let label = UILabel()
      label.text = "Sustain could not protect local storage. Restart the app to try again."
      label.numberOfLines = 0
      label.textAlignment = .center
      label.font = .preferredFont(forTextStyle: .body)
      label.adjustsFontForContentSizeCategory = true
      label.translatesAutoresizingMaskIntoConstraints = false
      controller.view.addSubview(label)
      NSLayoutConstraint.activate([
        label.leadingAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
        label.trailingAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
        label.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor)
      ])
      window?.rootViewController = controller
      window?.makeKeyAndVisible()
      return true
    }
${anchor}`);
}
module.exports = function withPrivateBackups(config) {
  config = withInfoPlist(config, c => {
    c.modResults.RCTAsyncStorageExcludeFromBackup = true;
    return c;
  });
  return withAppDelegate(config, c => {
    if (c.modResults.language !== "swift") throw Error("Sustain backup protection requires review for this AppDelegate language.");
    c.modResults.contents = addBackupExclusion(c.modResults.contents);
    return c;
  });
};
module.exports.addBackupExclusion = addBackupExclusion;
