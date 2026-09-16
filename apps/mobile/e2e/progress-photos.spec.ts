import { test, expect, signIn } from "./fixture";
import { localPhotoDay } from "../src/features/progress-photos/model";

const userId = "11111111-1111-4111-8111-111111111111";
const weightIds = [1, 2, 3].map(
  (value) => `22222222-2222-4222-8222-${String(value).padStart(12, "0")}`,
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT0kAAAAASUVORK5CYII=",
  "base64",
);

test("weight photos have independent three-photo limits and centered upload controls", async ({
  page,
  backend,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  backend.tables.vital_samples = weightIds.map((id, index) => ({
    id,
    user_id: userId,
    kind: "weight",
    value: 180 + index,
    unit: "lb",
    source: "manual",
    occurred_at: new Date(today.getTime() - index * 3600000).toISOString(),
    created_at: today.toISOString(),
    deleted_at: null,
  }));
  backend.tables.progress_photos = [0, 1, 2].map((index) => ({
    id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
    user_id: userId,
    weight_sample_id: index === 0 ? weightIds[0] : weightIds[1],
    object_path: `${userId}/synthetic-${index}.jpg`,
    taken_at: (index === 0 ? yesterday : today).toISOString(),
    local_day: localPhotoDay(index === 0 ? yesterday : today),
    daily_slot: index === 0 ? 1 : index,
    width: 1,
    height: 1,
    byte_size: 100,
  }));
  const signedPaths: string[][] = [];
  await page.route("**/storage/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET")
      return route.fulfill({ contentType: "image/png", body: png });
    if (path.includes("/object/sign/")) {
      const body = request.postDataJSON();
      if (Array.isArray(body.paths)) {
        signedPaths.push(body.paths);
        return route.fulfill({
          json: body.paths.map((path: string) => ({
            path,
            signedURL: `/object/sign/progress-photos/${path}?token=synthetic`,
            error: null,
          })),
        });
      }
      return route.fulfill({
        json: {
          signedURL: `${path.replace("/storage/v1", "")}?token=synthetic`,
        },
      });
    }
    return route.fulfill({
      json: request.method() === "DELETE" ? [] : { Key: "synthetic" },
    });
  });
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Weight", exact: true }).click();
  const openEntry = async (index: number) => {
    await page
      .getByRole("button", { name: /progress photos for/ })
      .nth(index)
      .click();
    await expect(
      page.getByText(/\d of 3 photos attached to this entry/),
    ).toBeVisible();
  };
  const close = () =>
    page.getByRole("button", { name: "Close progress photos" }).click();
  await openEntry(0);
  await expect(
    page.getByRole("img", { name: /Progress photo from/ }),
  ).toHaveCount(1);
  expect(signedPaths.at(-1)).toEqual([`${userId}/synthetic-0.jpg`]);
  await expect(
    page.getByText("1 of 3 photos attached to this entry"),
  ).toBeVisible();
  await close();
  await openEntry(1);
  expect(signedPaths.at(-1)).toEqual([
    `${userId}/synthetic-1.jpg`,
    `${userId}/synthetic-2.jpg`,
  ]);
  await expect(
    page.getByText("2 of 3 photos attached to this entry"),
  ).toBeVisible();
  await close();
  await openEntry(2);
  await expect(
    page.getByText("No photos attached to this weight entry."),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Progress photo from/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("0 of 3 photos attached to this entry"),
  ).toBeVisible();
  const camera = page.getByRole("button", { name: "Camera", exact: true });
  const library = page.getByRole("button", { name: "Library", exact: true });
  await expect(camera).toBeInViewport({ ratio: 1 });
  await expect(library).toBeInViewport({ ratio: 1 });
  // The full-screen modal slides in; compare after its position has settled.
  await expect
    .poll(async () => {
      const [left, right] = await Promise.all([
        camera.boundingBox(),
        library.boundingBox(),
      ]);
      return Math.abs(left!.y - right!.y);
    })
    .toBeLessThan(0.5);
  const cameraBox = (await camera.boundingBox())!;
  const libraryBox = (await library.boundingBox())!;
  expect(cameraBox.width).toBeCloseTo(libraryBox.width, 0);
  expect((cameraBox.x + libraryBox.x + libraryBox.width) / 2).toBeCloseTo(
    160,
    0,
  );
  for (let count = 1; count <= 3; count += 1) {
    const chooser = page.waitForEvent("filechooser");
    await library.click();
    await (
      await chooser
    ).setFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
    await expect(
      page.getByText(`${count} of 3 photos attached to this entry`),
    ).toBeVisible();
  }
  expect(backend.tables.progress_photos.at(-1)?.weight_sample_id).toBe(
    weightIds[2],
  );
  await expect(
    page.getByRole("button", { name: "Library", exact: true }),
  ).toBeDisabled();
  await page
    .getByText("3 of 3 photos attached to this entry")
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByText("3 of 3 photos attached to this entry"),
  ).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    path: testInfo.outputPath("photo-limit-short-screen.png"),
  });
  await close();
  await openEntry(0);
  await expect(
    page.getByText("1 of 3 photos attached to this entry"),
  ).toBeVisible();
  await expect(library).toBeEnabled();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const actions = page.getByTestId("confirmation-actions");
  const cancel = actions.getByRole("button", { name: "Cancel", exact: true });
  const confirm = actions.getByRole("button", { name: "Delete", exact: true });
  const cancelBox = (await cancel.boundingBox())!;
  const confirmBox = (await confirm.boundingBox())!;
  expect(cancelBox.width).toBeCloseTo(confirmBox.width, 0);
  expect(cancelBox.height).toBeCloseTo(confirmBox.height, 0);
  await expect(confirm.getByText("Delete", { exact: true })).toBeVisible();
  await expect(confirm.locator("svg")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("photo-delete-confirmation.png"),
  });
  await cancel.click();
  expect(backend.tables.progress_photos).toHaveLength(6);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.click();
  await expect(
    page.getByText("No photos attached to this weight entry."),
  ).toBeVisible();
  await expect(
    page.getByText("0 of 3 photos attached to this entry"),
  ).toBeVisible();
  await close();
  await openEntry(2);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.click();
  await expect(
    page.getByText("2 of 3 photos attached to this entry"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Library", exact: true }),
  ).toBeEnabled();
  expect(
    backend.tables.progress_photos.map((photo) => photo.weight_sample_id),
  ).toEqual([weightIds[1], weightIds[1], weightIds[2], weightIds[2]]);
});
