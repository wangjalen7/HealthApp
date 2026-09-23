import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Session } from "@supabase/supabase-js";

test("late account-A initialization cannot publish its identity or Face ID preference over account B", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let emit!: (event: string, session: unknown) => void;
  let initial!: (value: unknown) => void;
  let appState!: (state: string) => void;
  let sessionCheck!: (value: unknown) => void;
  const preferences = new Map<string, (value: boolean) => void>();
  const scopes: string[] = [];
  let revocations = 0;
  const initialPromise = new Promise((resolve) => {
    initial = resolve;
  });
  const harness = {
    revoke: async () => {
      revocations++;
    },
    onAppState: (callback: typeof appState) => {
      appState = callback;
      return { remove() {} };
    },
    rpc: () =>
      new Promise((resolve) => {
        sessionCheck = resolve;
      }),
    auth: {
      getSession: () => initialPromise,
      onAuthStateChange: (callback: typeof emit) => {
        emit = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut({ scope }: { scope: string }) {
        scopes.push(scope);
        emit("SIGNED_OUT", null);
        return { error: null };
      },
    },
    preference: (user: string) =>
      new Promise<boolean>((resolve) => preferences.set(user, resolve)),
  };
  Object.assign(globalThis, { __healthAuthTest: harness });
  const output = resolve("dist", `auth-session-test-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  const built = await build({
    entryPoints: [resolve("src/features/auth/auth-provider.tsx")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    plugins: [
      {
        name: "auth-test-adapters",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(react-native|\.\.\/\.\.\/lib\/(supabase|config)|\.\/biometric-auth|\.\/welcome-storage)$/,
            },
            (args) => ({ path: args.path, namespace: "auth-test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "auth-test" }, (args) => ({
            contents:
              args.path === "./welcome-storage"
                ? "export const finishWelcomeIntro=async()=>{};"
                : args.path === "react-native"
                  ? "export const AppState={addEventListener:(_,cb)=>globalThis.__healthAuthTest.onAppState(cb)};export const Linking={getInitialURL:async()=>null,addEventListener:()=>({remove(){}})};"
                  : args.path.endsWith("config")
                    ? "export const supabaseConfig={isConfigured:true};"
                    : args.path.endsWith("supabase")
                      ? "export const supabase={auth:globalThis.__healthAuthTest.auth,rpc:globalThis.__healthAuthTest.rpc};export const removeLegacyPersistedSupabaseSession=async()=>{};"
                      : "export const getFaceIdAvailability=async()=>({available:true});export const isFaceIdEnabled=globalThis.__healthAuthTest.preference;export const authenticateWithFaceId=async()=>({success:true});export const enrollFaceIdLoginCredential=async()=>{};export const revokeFaceIdLoginCredential=globalThis.__healthAuthTest.revoke;",
          }));
        },
      },
    ],
  });
  await writeFile(output, built.outputFiles[0].contents);
  const components = createRequire(output)(
    output,
  ) as typeof import("./auth-provider");
  let state!: ReturnType<typeof components.useAuth>;
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
    const a = { user: { id: "a" } } as Session,
      b = { user: { id: "b" } } as Session;
    await act(async () => {
      emit("SIGNED_IN", a);
      emit("SIGNED_IN", b);
      emit("TOKEN_REFRESHED", { ...b });
    });
    await act(async () => {
      preferences.get("b")!(false);
    });
    assert.equal(state.session?.user.id, "b");
    assert.equal(state.faceIdEnabled, false);
    assert.equal(
      state.sessionReady,
      true,
      "a token refresh does not invalidate the pending device-security read",
    );
    await act(async () => {
      preferences.get("a")!(true);
      initial({ data: { session: a } });
    });
    assert.equal(state.session?.user.id, "b");
    assert.equal(state.faceIdEnabled, false);
    assert.equal(state.biometricLocked, false);
    await act(async () => {
      appState("background");
    });
    assert.equal(
      state.biometricLocked,
      false,
      "background locking is opt-in through Face ID",
    );
    await act(async () => {
      appState("active");
    });
    await act(async () => {
      sessionCheck({ error: { code: "NETWORK" } });
    });
    assert.equal(state.session?.user.id, "b");
    await act(async () => {
      appState("active");
    });
    await act(async () => {
      emit("TOKEN_REFRESHED", { ...b });
    });
    await act(async () => {
      sessionCheck({ error: { code: "28000" } });
    });
    assert.equal(
      state.session?.user.id,
      "b",
      "old session check cannot end a newer session",
    );
    await act(async () => {
      appState("active");
    });
    await act(async () => {
      sessionCheck({ error: { code: "28000" } });
    });
    assert.equal(
      state.session,
      null,
      "confirmed revoked session clears private UI",
    );
    assert.deepEqual(scopes, ["local"]);
    await act(async () => {
      emit("SIGNED_IN", b);
    });
    await act(async () => {
      preferences.get("b")!(true);
    });
    assert.equal(state.faceIdEnabled, true);
    await act(async () => {
      appState("background");
    });
    assert.equal(state.biometricLocked, true);
    await act(async () => {
      await state.unlockWithFaceId();
    });
    assert.equal(state.biometricLocked, false);
    await act(() => state.signOut());
    assert.deepEqual(scopes, ["local", "local"]);
    assert.equal(revocations, 0);
    assert.equal(state.session, null);
    await act(async () => {
      emit("SIGNED_IN", b);
    });
    await act(async () => {
      preferences.get("b")!(true);
    });
    assert.equal(
      state.faceIdEnabled,
      true,
      "local sign-out does not revoke Face ID enrollment",
    );
  } finally {
    if (tree) await act(() => tree.unmount());
    await unlink(output);
    Reflect.deleteProperty(globalThis, "__healthAuthTest");
  }
});
