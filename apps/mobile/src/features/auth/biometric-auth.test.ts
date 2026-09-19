import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

test("Face ID rotation reads once, recreates protected storage without an update prompt, and persists before session acceptance", async () => {
  const account = {
    userId: "user-1",
    email: "test@example.invalid",
    credentialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const deviceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const key = "healthapp.face-id-credential.user-1";
  let serverSecret = "a".repeat(43),
    prompts = 0,
    sessions = 0,
    failWrite = false;
  const protectedItems = new Map([
    [key, JSON.stringify({ ...account, deviceId, secret: serverSecret })],
  ]);
  const markers = new Map([
    ["healthapp.face-id-account", JSON.stringify(account)],
  ]);
  const events: string[] = [];
  const harness = {
    secure: {
      async getItemAsync(
        item: string,
        options: { requireAuthentication?: boolean },
      ) {
        assert.equal(options.requireAuthentication, true);
        prompts++;
        events.push("read");
        return protectedItems.get(item) ?? null;
      },
      async deleteItemAsync(item: string) {
        events.push("delete");
        protectedItems.delete(item);
      },
      async setItemAsync(
        item: string,
        value: string,
        options: {
          requireAuthentication?: boolean;
          keychainAccessible?: string;
        },
      ) {
        assert.equal(options.requireAuthentication, true);
        assert.equal(options.keychainAccessible, "device-only");
        if (protectedItems.has(item)) prompts++; // Mirrors iOS SecItemUpdate authentication.
        events.push("create");
        if (failWrite) throw new Error("Keychain write failed");
        protectedItems.set(item, value);
      },
    },
    markers: {
      async getItem(item: string) {
        return markers.get(item) ?? null;
      },
      async setItem(item: string, value: string) {
        markers.set(item, value);
      },
      async removeItem(item: string) {
        markers.delete(item);
      },
    },
    supabase: {
      functions: {
        async invoke(_name: string, { body }: { body: { secret: string } }) {
          assert.equal(body.secret, serverSecret);
          serverSecret = String.fromCharCode(98 + sessions).repeat(43);
          events.push("rotate");
          return {
            data: {
              nextSecret: serverSecret,
              accessToken: "test-access",
              refreshToken: "test-refresh",
              userId: account.userId,
            },
            error: null,
          };
        },
      },
      auth: {
        async setSession() {
          assert.equal(
            JSON.parse(protectedItems.get(key)!).secret,
            serverSecret,
          );
          events.push("session");
          sessions++;
          return { error: null };
        },
      },
    },
  };
  Object.assign(globalThis, { __biometricRotationTest: harness });
  const output = resolve("dist", `biometric-rotation-test-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  try {
    const result = await build({
      entryPoints: [resolve("src/features/auth/biometric-auth.ts")],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      plugins: [
        {
          name: "native-biometric-adapters",
          setup(builder) {
            builder.onResolve(
              {
                filter:
                  /^(react-native|expo-local-authentication|expo-secure-store|\.\.\/\.\.\/lib\/(supabase|secure-store|id))$/,
              },
              (args) => ({ path: args.path, namespace: "biometric-test" }),
            );
            builder.onLoad(
              { filter: /.*/, namespace: "biometric-test" },
              (args) => ({
                contents:
                  args.path === "react-native"
                    ? 'export const Platform={OS:"ios"};'
                    : args.path === "expo-secure-store"
                      ? 'const s=globalThis.__biometricRotationTest.secure;export const getItemAsync=s.getItemAsync,setItemAsync=s.setItemAsync,deleteItemAsync=s.deleteItemAsync,WHEN_PASSCODE_SET_THIS_DEVICE_ONLY="device-only";'
                      : args.path === "expo-local-authentication"
                        ? 'export const hasHardwareAsync=async()=>true,isEnrolledAsync=async()=>true,supportedAuthenticationTypesAsync=async()=>[1],AuthenticationType={FACIAL_RECOGNITION:1};export const authenticateAsync=async()=>{throw new Error("Redundant Face ID prompt")};'
                        : args.path.endsWith("supabase")
                          ? "export const supabase=globalThis.__biometricRotationTest.supabase;"
                          : args.path.endsWith("secure-store")
                            ? "export const secureStoreAdapter=globalThis.__biometricRotationTest.markers;"
                            : 'export const createUuid=()=>"cccccccc-cccc-4ccc-8ccc-cccccccccccc";',
              }),
            );
          },
        },
      ],
    });
    await writeFile(output, result.outputFiles[0].contents);
    const auth = createRequire(output)(
      output,
    ) as typeof import("./biometric-auth");
    assert.equal((await auth.signInWithFaceIdCredential()).success, true);
    assert.deepEqual(events, ["read", "rotate", "delete", "create", "session"]);
    assert.equal(prompts, 1);
    assert.equal((await auth.signInWithFaceIdCredential()).success, true);
    assert.equal(
      prompts,
      2,
      "a later login still requires its own authentication",
    );
    failWrite = true;
    await assert.rejects(
      auth.signInWithFaceIdCredential(),
      /Keychain write failed/,
    );
    assert.equal(
      sessions,
      2,
      "never accept a session before protected persistence succeeds",
    );
    assert.equal(protectedItems.has(key), false);
  } finally {
    await unlink(output).catch(() => undefined);
    Reflect.deleteProperty(globalThis, "__biometricRotationTest");
  }
});
