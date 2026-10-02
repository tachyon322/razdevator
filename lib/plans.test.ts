import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_TOPUP,
  PACK_MODE_TOPUP_RANGE,
  isValidTopUp,
  PRICES,
  TOPUPS,
  canAfford,
  formatPrice,
  generationCostRub,
} from "./plans";

test("цены заданы ожидаемо", () => {
  assert.equal(PRICES.image, 100);
  assert.equal(PRICES.video, 250);
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

test("TOPUPS: пресеты пополнения по возрастанию", () => {
  assert.deepEqual([...TOPUPS], [500, 1000, 2000, 5000]);
  assert.ok(TOPUPS.every((amount) => amount % PRICES.image === 0));
});

test("MIN_TOPUP: минимум не больше самого мелкого пресета", () => {
  assert.equal(MIN_TOPUP, 300);
  assert.ok(MIN_TOPUP <= Math.min(...TOPUPS));
});

test("formatPrice: рубли с разделителем разрядов", () => {
  assert.equal(formatPrice(100), "100 ₽");
  assert.equal(formatPrice(5000).replace(/\s/g, " "), "5 000 ₽");
});

test("canAfford: генерация проходит, только если баланса хватает", () => {
  assert.equal(canAfford(PRICES.image, PRICES.image), true);
  assert.equal(canAfford(PRICES.image - 1, PRICES.image), false);
  assert.equal(canAfford(0, PRICES.image), false);
  assert.equal(canAfford(250, 250), true);
  assert.equal(canAfford(249, 250), false);
});

test("canAfford: на два фото нужно 200 ₽", () => {
  const cost = generationCostRub("image", 2);
  assert.equal(cost, 200);
  assert.equal(canAfford(200, cost), true);
  assert.equal(canAfford(199, cost), false);
});

test("canAfford: видео стоит фиксированно, независимо от длительности", () => {
  assert.equal(canAfford(250, generationCostRub("video", 4)), true);
  assert.equal(canAfford(249, generationCostRub("video", 1)), false);
});

test("isValidTopUp: обычный диапазон по умолчанию, узкий — в режиме пакетов", () => {
  assert.equal(isValidTopUp(300), true);
  assert.equal(isValidTopUp(299), false);
  assert.equal(isValidTopUp(100_000), true);
  assert.equal(isValidTopUp(500.5), false);

  assert.deepEqual(PACK_MODE_TOPUP_RANGE, { min: 2000, max: 10_000 });
  assert.equal(isValidTopUp(1999, PACK_MODE_TOPUP_RANGE), false);
  assert.equal(isValidTopUp(2000, PACK_MODE_TOPUP_RANGE), true);
  assert.equal(isValidTopUp(10_000, PACK_MODE_TOPUP_RANGE), true);
  assert.equal(isValidTopUp(10_001, PACK_MODE_TOPUP_RANGE), false);
});
