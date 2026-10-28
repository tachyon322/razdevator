import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasConfigKey,
  maskSecret,
  openSecret,
  sealSecret,
} from "./provider-secrets";

const KEY = "a".repeat(64);

test("без ключа секрет хранится как plain и читается обратно", () => {
  delete process.env.PAYMENTS_CONFIG_KEY;
  assert.equal(hasConfigKey(), false);
  const sealed = sealSecret("sk_test_123");
  assert.equal(sealed, "plain:sk_test_123");
  assert.equal(openSecret(sealed), "sk_test_123");
});

test("с ключом секрет шифруется AES-256-GCM и читается обратно", () => {
  process.env.PAYMENTS_CONFIG_KEY = KEY;
  try {
    assert.equal(hasConfigKey(), true);
    const sealed = sealSecret("sk_test_123");
    assert.ok(sealed.startsWith("enc:v1:"));
    assert.notEqual(sealed, "sk_test_123");
    assert.equal(openSecret(sealed), "sk_test_123");
    // Разные IV — разные шифртексты.
    assert.notEqual(sealSecret("sk_test_123"), sealed);
  } finally {
    delete process.env.PAYMENTS_CONFIG_KEY;
  }
});

test("чужой ключ не расшифровывает секрет", () => {
  process.env.PAYMENTS_CONFIG_KEY = KEY;
  let sealed = "";
  try {
    sealed = sealSecret("sk_test_123");
  } finally {
    delete process.env.PAYMENTS_CONFIG_KEY;
  }
  process.env.PAYMENTS_CONFIG_KEY = "b".repeat(64);
  try {
    assert.throws(() => openSecret(sealed));
  } finally {
    delete process.env.PAYMENTS_CONFIG_KEY;
  }
});

test("некорректный ключ отклоняется", () => {
  process.env.PAYMENTS_CONFIG_KEY = "too-short";
  try {
    assert.throws(() => sealSecret("sk"), /32 байта/);
  } finally {
    delete process.env.PAYMENTS_CONFIG_KEY;
  }
});

test("маска не раскрывает секрет", () => {
  assert.equal(maskSecret("pk_1234567890"), "pk_1…90");
  assert.equal(maskSecret("short"), "sh…");
  assert.equal(maskSecret(""), "");
});
