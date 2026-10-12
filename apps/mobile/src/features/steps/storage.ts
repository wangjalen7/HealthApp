import AsyncStorage from "@react-native-async-storage/async-storage";
import { authorizeSteps, readStepBuckets } from "./reader";
import { createStepStore } from "./store-core";
export const {
  readStepCache,
  connectSteps,
  disconnectSteps,
  refreshSteps,
  drainSteps,
} = createStepStore(AsyncStorage, { authorizeSteps, readStepBuckets });
