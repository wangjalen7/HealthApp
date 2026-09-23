import AsyncStorage from "@react-native-async-storage/async-storage";

export const welcomeSeenKey = "healthapp.welcome-seen";
export async function finishWelcomeIntro() {
  await AsyncStorage.setItem(welcomeSeenKey, "true");
}
