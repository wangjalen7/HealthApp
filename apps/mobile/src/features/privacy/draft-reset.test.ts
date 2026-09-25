import assert from "node:assert/strict";
import test from "node:test";
import { observeDraftReset, resetMountedDrafts } from "./draft-reset";
test("privacy draft reset reaches mounted forms only for the selected account",()=>{
  let first=0,other=0;
  const stop=observeDraftReset("first",()=>first++);
  const stopOther=observeDraftReset("other",()=>other++);
  resetMountedDrafts("first");assert.equal(first,1);assert.equal(other,0);
  stop();resetMountedDrafts("first");assert.equal(first,1);stopOther();
});
