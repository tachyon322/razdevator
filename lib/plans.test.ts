import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRICES,
  TRIAL,
  formatPrice,
  generationCostRub,
  generationWeight,
  resolveBilling,
} from "./plans";

test("цены и пробный лимит заданы ожидаемо", () => {
  assert.equal(PRICES.image, 100);
  assert.equal(PRICES.video, 250);
  assert.equal(TRIAL.limit, 3);
});

test("generationCostRub: фото — за кадр, видео — фиксированно", () => {
  assert.equal(generationCostRub("image", 1), 100);
  assert.equal(generationCostRub("image", 2), 200);
  assert.equal(generationCostRub("image", 4), 400);
  assert.equal(generationCostRub("video", 1), 250);
  assert.equal(generationCostRub("video", 4), 250);
});

test("generationCostRub: некорректное количество считается как 1 кадр", () => {
  assert.equal(generationCostRub("image", 0), 100);
  assert.equal(generationCostRub("image", -3), 100);
});

test("generationWeight: видео весит 3, фото — по кадру", () => {
  assert.equal(generationWeight("image", 1), 1);
  assert.equal(generationWeight("image", 4), 4);
  assert.equal(generationWeight("video", 1), 3);
  assert.equal(generationWeight("video", 4), 3);
});

test("formatPrice: рубли с разделителем разрядов", () => {
  assert.equal(formatPrice(100), "100 ₽");
  assert.equal(formatPrice(5000).replace(/\s/g, " "), "5 000 ₽");
});

test("resolveBilling: пробный лимит покрывает — генерация бесплатна", () => {
  assert.deepEqual(
    resolveBilling({ kind: "image", count: 1, trialLeft: 3, balance: 0 }),
    { mode: "trial", units: 1, costRub: 0 },
  );
  assert.deepEqual(
    resolveBilling({ kind: "video", count: 1, trialLeft: 3, balance: 0 }),
    { mode: "trial", units: 3, costRub: 0 },
  );
});

test("resolveBilling: пробный не хватает, но денег достаточно — баланс", () => {
  assert.deepEqual(
    resolveBilling({ kind: "image", count: 1, trialLeft: 0, balance: 100 }),
    { mode: "balance", units: 0, costRub: 100 },
  );
  assert.deepEqual(
    resolveBilling({ kind: "video", count: 1, trialLeft: 2, balance: 250 }),
    { mode: "balance", units: 0, costRub: 250 },
  );
});

test("resolveBilling: на 2 фото остатка пробного не хватает — списываем 200 ₽", () => {
  assert.deepEqual(
    resolveBilling({ kind: "image", count: 2, trialLeft: 1, balance: 200 }),
    { mode: "balance", units: 0, costRub: 200 },
  );
});

test("resolveBilling: не хватает ни пробных, ни денег — null", () => {
  assert.equal(
    resolveBilling({ kind: "image", count: 1, trialLeft: 0, balance: 50 }),
    null,
  );
  assert.equal(
    resolveBilling({ kind: "video", count: 1, trialLeft: 0, balance: 200 }),
    null,
  );
});

test("resolveBilling: ровно хватает денег — разрешаем", () => {
  assert.deepEqual(
    resolveBilling({ kind: "video", count: 1, trialLeft: 0, balance: 250 }),
    { mode: "balance", units: 0, costRub: 250 },
  );
});
