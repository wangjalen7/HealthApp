import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { entryCanResolve } from "./entry-state";

test("Face ID waits for native foreground, recovers from interruptions, and retains later privacy locking", async (t) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const account = {
    userId: "11111111-1111-4111-8111-111111111111",
    email: "test@example.invalid",
    credentialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const credential = {
    ...account,
    deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    secret: "a".repeat(43),
  };
  const storage = new Map([
    ["healthapp.face-id-account", JSON.stringify(account)],
    [`healthapp.face-id-enabled.${account.userId}`, "true"],
    [
      `healthapp.face-id-credential.${account.userId}`,
      JSON.stringify(credential),
    ],
  ]);
  const listeners = new Set<(state: string) => void>();
  let emitAuth!: (event: string, session: unknown) => void;
  let session: { user: typeof account & { id: string } } | null = null;
  let installs = 0;
  const appState = {
    currentState: "active",
    addEventListener(_event: string, callback: (state: string) => void) {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
  };
  function changeState(state: string) {
    appState.currentState = state;
    for (const callback of listeners) callback(state);
  }
  const harness = {
    appState,
    storage: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: async (key: string) => {
        storage.delete(key);
      },
    },
    supabase: {
      rpc: async () => ({ error: null }),
      functions: {
        invoke: async () => ({
          data: {
            userId: account.userId,
            nextSecret: "b".repeat(43),
            accessToken: "synthetic-access",
            refreshToken: "synthetic-refresh",
          },
          error: null,
        }),
      },
      auth: {
        getSession: async () => ({ data: { session } }),
        onAuthStateChange(callback: typeof emitAuth) {
          emitAuth = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async setSession() {
          installs++;
          session = { user: { ...account, id: account.userId } };
          emitAuth("SIGNED_IN", session);
          return { data: { session }, error: null };
        },
      },
    },
  };
  Object.assign(globalThis, { __faceIdEntryTest: harness });
  const output = resolve("dist", `face-id-entry-test-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  const built = await build({
    stdin: {
      contents:
        'export * from "./auth-provider"; export {signInWithFaceIdCredential,isFaceIdEnabled} from "./biometric-auth";',
      resolveDir: resolve("src/features/auth"),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    plugins: [
      {
        name: "face-id-entry-adapters",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(react-native|expo-local-authentication|expo-secure-store|\.\.\/\.\.\/lib\/(supabase|config|secure-store|id)|\.\/welcome-storage|\.\.\/reminders\/lifecycle)$/,
            },
            (args) => ({ path: args.path, namespace: "face-id-entry-test" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "face-id-entry-test" },
            (args) => {
              const prefix = "const h=globalThis.__faceIdEntryTest;";
              const modules: Record<string, string> = {
                "react-native":
                  'export const Platform={OS:"ios"}, AppState=h.appState;export const Linking={getInitialURL:async()=>null,addEventListener:()=>({remove(){}})};',
                "expo-local-authentication":
                  "export const hasHardwareAsync=async()=>true,isEnrolledAsync=async()=>true,supportedAuthenticationTypesAsync=async()=>[1],AuthenticationType={FACIAL_RECOGNITION:1};export const authenticateAsync=async()=>({success:true});",
                "expo-secure-store":
                  'export const getItemAsync=h.storage.getItem,setItemAsync=h.storage.setItem,deleteItemAsync=h.storage.removeItem,WHEN_PASSCODE_SET_THIS_DEVICE_ONLY="device-only";',
                "../../lib/supabase":
                  "export const supabase=h.supabase;export const removeLegacyPersistedSupabaseSession=async()=>{};",
                "../../lib/config":
                  "export const supabaseConfig={isConfigured:true};",
                "../../lib/secure-store":
                  "export const secureStoreAdapter=h.storage;",
                "../../lib/id":
                  'export const createUuid=()=>"cccccccc-cccc-4ccc-8ccc-cccccccccccc";',
                "./welcome-storage":
                  "export const finishWelcomeIntro=async()=>{};",
                "../reminders/lifecycle":
                  "export const prepareReminderSignOut=async()=>{};",
              };
              return { contents: prefix + modules[args.path] };
            },
          );
        },
      },
    ],
  });
  await writeFile(output, built.outputFiles[0].contents);
  const components = createRequire(output)(
    output,
  ) as typeof import("./auth-provider") & typeof import("./biometric-auth");
  let state!: ReturnType<typeof components.useAuth>;
  const readState = () => state;
  function Probe() {
    state = components.useAuth();
    return null;
  }
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(
        createElement(components.AuthProvider, {
          children: createElement(Probe),
        }),
      );
    });
    assert.equal(state.session, null);
    let login!: ReturnType<typeof components.signInWithFaceIdCredential>;
    await act(async () => {
      // Keychain finishes while iOS has not yet delivered the active event.
      changeState("inactive");
      login = components.signInWithFaceIdCredential();
    });
    assert.equal(
      installs,
      0,
      "do not publish SIGNED_IN while the native prompt still owns foreground",
    );
    assert.equal(state.session, null);
    await act(async () => {
      changeState("active");
      assert.equal((await login).success, true);
    });
    assert.equal(installs, 1);
    assert.equal(state.biometricLocked, false);
    assert.equal(state.sessionReady, true);
    assert.equal(
      entryCanResolve(
        {
          id: 1,
          kind: "biometric",
          phase: "resolving",
          fallback: "/(app)",
          userId: account.userId,
        },
        {
          userId: readState().session?.user.id,
          loading: !state.sessionReady,
          locked: state.biometricLocked,
        },
        true,
      ),
      true,
      "successful biometric entry can reach its destination",
    );
    assert.equal(
      listeners.size,
      1,
      "only the provider's normal privacy listener remains",
    );
    await act(async () => {
      changeState("background");
    });
    assert.equal(
      state.biometricLocked,
      true,
      "real app departure retains privacy locking",
    );
    await act(async () => {
      changeState("active");
    });
    assert.equal(
      state.biometricLocked,
      true,
      "foreground alone cannot bypass the subsequent lock",
    );
    for (const interruption of ["background", "timeout"] as const) {
      await act(async () => {
        session = null;
        emitAuth("SIGNED_OUT", null);
      });
      if (interruption === "timeout")
        t.mock.timers.enable({ apis: ["setTimeout"] });
      const before: number = installs;
      await act(async () => {
        changeState("inactive");
        login = components.signInWithFaceIdCredential();
      });
      assert.equal(installs, before);
      assert.equal(listeners.size, 2);
      await act(async () => {
        if (interruption === "background") changeState("background");
        else t.mock.timers.tick(10_000);
        const result = await login;
        assert.equal(result.success, false);
        assert.equal(result.invalidCredential, undefined);
        assert.match(result.message!, /interrupted/);
      });
      t.mock.timers.reset();
      assert.equal(
        installs,
        before,
        "an interrupted handoff cannot install a session",
      );
      assert.equal(
        listeners.size,
        1,
        "interruption removes its temporary native listener",
      );
      assert.equal(state.session, null);
      assert.equal(
        await components.isFaceIdEnabled(account.userId),
        true,
        "interruption preserves enrollment",
      );
      await act(async () => {
        changeState("active");
        assert.equal(
          (await components.signInWithFaceIdCredential()).success,
          true,
        );
      });
      assert.equal(
        installs,
        before + 1,
        "retry uses the saved rotated credential",
      );
      assert.equal(state.biometricLocked, false);
    }
  } finally {
    t.mock.timers.reset();
    if (tree) await act(() => tree.unmount());
    await unlink(output).catch(() => undefined);
    Reflect.deleteProperty(globalThis, "__faceIdEntryTest");
  }
});
