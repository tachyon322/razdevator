"use client";

import { useEffect } from "react";
import { captureAffiliateParams } from "@cashx/sdk/tracker";

/** Запоминает ?ref и ?click_token партнёрки в cookie (90 дней) и чистит URL. */
export function AffiliateTracker() {
  useEffect(() => {
    captureAffiliateParams();
  }, []);
  return null;
}
