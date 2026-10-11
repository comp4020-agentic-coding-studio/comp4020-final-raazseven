import { expect, it } from "vitest";
import { baseUrl, TINY_PNG, uploadForm } from "./support.ts";

// Starting a group now takes a whole profile --- name, bio, at least one
// game tag, and a photo are all mandatory (src/server.ts POST /groups) --- so
// there's something real on the page before any result has been logged.
// This checks the validation itself; spec/support.ts's createGroup() is what
// every other spec file uses to get a valid one.

it("creating a group with every required field succeeds and shows the profile", async () => {
  const name = `spec-create-group-${Date.now()}`;
  const form = uploadForm(
    { name, bio: "Friendly rivalry, kept on the record.", tags: "FIFA, Trivia" },
    "avatar",
    "avatar.png",
    "image/png",
    TINY_PNG,
  );
  const res = await fetch(new URL("/groups", baseUrl), { method: "POST", body: form, redirect: "manual" });
  expect(res.status).toBe(303);
  const groupPath = res.headers.get("location")!;

  const html = await (await fetch(new URL(groupPath, baseUrl))).text();
  expect(html).toContain("Friendly rivalry, kept on the record.");
  expect(html).toContain("FIFA");
  expect(html).toContain("Trivia");

  const avatarRes = await fetch(new URL(`${groupPath}/avatar`, baseUrl));
  expect(avatarRes.headers.get("content-type")).toBe("image/png");
});

it("a group name alone is not enough --- bio, tags and a photo are all required", async () => {
  const name = `spec-create-group-${Date.now()}-bare`;

  const noBio = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    body: uploadForm({ name, bio: "", tags: "FIFA" }, "avatar", "a.png", "image/png", TINY_PNG),
  });
  expect(noBio.status).toBe(200); // re-rendered with an error, not redirected
  expect(await noBio.text()).toContain("bio");

  const noTags = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    body: uploadForm({ name, bio: "a bio", tags: "" }, "avatar", "a.png", "image/png", TINY_PNG),
  });
  expect(noTags.status).toBe(200);
  expect(await noTags.text()).toContain("tag");

  const noPhoto = new FormData();
  noPhoto.set("name", name);
  noPhoto.set("bio", "a bio");
  noPhoto.set("tags", "FIFA");
  const noPhotoRes = await fetch(new URL("/groups", baseUrl), { method: "POST", body: noPhoto });
  expect(noPhotoRes.status).toBe(200);
  expect(await noPhotoRes.text()).toContain("photo");
});

it("an invalid photo at group creation is rejected the same way an avatar upload is", async () => {
  const name = `spec-create-group-${Date.now()}-badphoto`;
  const res = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    body: uploadForm(
      { name, bio: "a bio", tags: "FIFA" },
      "avatar",
      "notes.txt",
      "text/plain",
      new TextEncoder().encode("not an image"),
    ),
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("PNG, JPEG, or WebP");
});

it("a failed submission re-fills the name, bio and tags so they don't have to be retyped", async () => {
  const name = `spec-create-group-${Date.now()}-prefill`;
  const res = await fetch(new URL("/groups", baseUrl), {
    method: "POST",
    // bio missing --- everything else should still come back in the form
    body: uploadForm({ name, bio: "", tags: "FIFA, Trivia" }, "avatar", "a.png", "image/png", TINY_PNG),
  });
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain(name);
  expect(html).toContain("FIFA, Trivia");
});
