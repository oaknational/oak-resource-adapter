import type { LessonContext } from "./publicTypes.js";

export type OnboardingTripLesson = Pick<LessonContext, "lessonSlug" | "programmeSlug">;

const STORAGE_KEY = "resource-adapter:onboarding-trip";

const tripTo = ({ lessonSlug, programmeSlug }: OnboardingTripLesson) =>
  `${programmeSlug}/${lessonSlug}`;

export function rememberOnboardingTrip(lesson: OnboardingTripLesson): void {
  try {
    globalThis.sessionStorage.setItem(STORAGE_KEY, tripTo(lesson));
  } catch {
    // Without storage the teacher returns to the usual prompt for their account.
  }
}

export function wasOnboardingTripFrom(lesson: OnboardingTripLesson): boolean {
  try {
    return globalThis.sessionStorage.getItem(STORAGE_KEY) === tripTo(lesson);
  } catch {
    return false;
  }
}

export function forgetOnboardingTrip(): void {
  try {
    globalThis.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}
