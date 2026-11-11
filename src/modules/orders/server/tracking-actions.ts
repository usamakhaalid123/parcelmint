"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { getServerEnvironment } from "@/config/env";
import {
  issueTrackingChallenge,
  verifyTrackingChallenge,
} from "@/modules/orders/server/tracking-service";

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function requestTrackingCodeAction(formData: FormData): Promise<never> {
  let challenge: Awaited<ReturnType<typeof issueTrackingChallenge>>;
  try {
    challenge = await issueTrackingChallenge({
      mobileNumber: value(formData, "mobileNumber"),
      orderNumber: value(formData, "orderNumber"),
    });
  } catch (error) {
    logger.warn("Tracking challenge request failed", { error });
    redirect("/track?error=request_failed");
  }
  const developmentCode =
    challenge.developmentCode === undefined ? "" : `&developmentCode=${challenge.developmentCode}`;
  redirect(`/track/verify?challenge=${challenge.challengeId}${developmentCode}`);
}

export async function verifyTrackingCodeAction(formData: FormData): Promise<never> {
  const challengeId = value(formData, "challengeId");
  let verified: Awaited<ReturnType<typeof verifyTrackingChallenge>>;
  try {
    verified = await verifyTrackingChallenge({
      challengeId,
      code: value(formData, "code"),
    });
  } catch {
    redirect(`/track/verify?challenge=${challengeId}&error=verification_failed`);
  }
  const cookieStore = await cookies();
  cookieStore.set("parcelmint_tracking", verified.token, {
    httpOnly: true,
    maxAge: 30 * 60,
    path: "/track",
    sameSite: "lax",
    secure: getServerEnvironment().deployment !== "local",
  });
  redirect(`/track/${verified.orderNumber}`);
}
