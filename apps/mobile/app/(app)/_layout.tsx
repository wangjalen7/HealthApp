import { Redirect, router, Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/features/auth/auth-provider";

function CreateTabButton() {
  return (
    <Pressable
      accessibilityLabel="Create a new health log"
      accessibilityRole="button"
      onPress={() => router.push("/create")}
      style={styles.createTabButton}
    >
      <View style={styles.createCircle}>
        <Text style={styles.createPlus}>+</Text>
      </View>
      <Text style={styles.createLabel}>Track</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: "#F7FAFC" },
        tabBarActiveTintColor: "#16776A",
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { minWidth: 0, paddingHorizontal: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", lineHeight: 13 },
        tabBarStyle: {
          borderTopColor: "#D9E2EC",
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 7),
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Summary" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen
        name="track"
        options={{
          title: "Create",
          tabBarButton: () => <CreateTabButton />,
        }}
      />
      <Tabs.Screen name="workout" options={{ href: null }} />
      <Tabs.Screen
        name="history/[id]"
        options={{ href: null, title: "Edit workout" }}
      />
      <Tabs.Screen name="history/edit" options={{ href: null }} />
      <Tabs.Screen name="nutrition" options={{ href: null }} />
      <Tabs.Screen name="water" options={{ href: null }} />
      <Tabs.Screen name="weight" options={{ href: null }} />
      <Tabs.Screen name="reminders" options={{ href: null }} />
      <Tabs.Screen name="coach" options={{ title: "AI Coach" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createTabButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
    marginTop: -24,
  },
  createCircle: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderColor: "#F7FAFC",
    borderRadius: 28,
    borderWidth: 5,
    height: 58,
    justifyContent: "center",
    shadowColor: "#102A43",
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    width: 58,
  },
  createPlus: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 37,
  },
  createLabel: {
    color: "#16776A",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },
});
