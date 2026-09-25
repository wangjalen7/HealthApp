import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import notices from "../../../../legal/third-party-notices.json";
import { DetailScreen, SettingsButton, styles } from "../../src/features/profile/settings-ui";
export default function Licenses() {
  const [selected,setSelected] = useState<string>();
  return <DetailScreen title="Third-party licenses" backLabel="Back" onBack={() => router.canGoBack() ? router.back() : router.replace("/legal")}>
    <Text style={styles.copy}>Installed runtime package notices. Native build and asset licensing still require release review.</Text>
    {notices.map(n => <View key={n.name+"@"+n.version}>
      <SettingsButton secondary label={`${n.name} ${n.version} (${n.license})`} onPress={() => setSelected(selected === n.name ? undefined : n.name)} />
      {selected === n.name && <Text selectable style={styles.copy}>{n.text}</Text>}
    </View>)}
  </DetailScreen>;
}
