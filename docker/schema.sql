create table if not exists "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "plan" text, "generationsUsed" integer, "planRenewsAt" date);

create table if not exists "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table if not exists "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table if not exists "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create index if not exists "session_userId_idx" on "session" ("userId");

create index if not exists "account_userId_idx" on "account" ("userId");

create index if not exists "verification_identifier_idx" on "verification" ("identifier");

-- --- Генерации (NanoGPT -> S3) ---

create table if not exists "generation" ("id" text not null primary key, "userId" text not null references "user" ("id") on delete cascade, "kind" text not null check ("kind" in ('image','video')), "status" text not null check ("status" in ('pending','processing','succeeded','failed')), "model" text not null, "prompt" text not null, "params" text not null, "sourceKey" text, "sourceContentType" text, "providerRunId" text, "costUsd" real, "error" text, "favorite" integer not null default 0, "createdAt" text not null, "updatedAt" text not null);

create table if not exists "generation_asset" ("id" text not null primary key, "generationId" text not null references "generation" ("id") on delete cascade, "kind" text not null check ("kind" in ('image','video')), "s3Key" text not null, "contentType" text not null, "width" integer, "height" integer, "durationSec" real, "position" integer not null default 0, "createdAt" text not null);

create index if not exists "generation_userId_createdAt_idx" on "generation" ("userId", "createdAt" desc);

create index if not exists "generation_userId_favorite_createdAt_idx" on "generation" ("userId", "createdAt" desc) where "favorite" = 1;

create index if not exists "generation_asset_generationId_idx" on "generation_asset" ("generationId");

-- --- Платежи (пополнение баланса через Exenta Pay) ---

create table if not exists "payment" ("id" text not null primary key, "userId" text not null references "user" ("id") on delete cascade, "providerUuid" text unique, "amountRub" integer not null, "status" text not null check ("status" in ('CREATED','PENDING','SUCCESS','FAILED','CANCELLED')), "creditedAt" text, "createdAt" text not null, "updatedAt" text not null);

create index if not exists "payment_userId_createdAt_idx" on "payment" ("userId", "createdAt" desc);
