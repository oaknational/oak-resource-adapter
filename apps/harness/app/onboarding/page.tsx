import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "../_components/shared";
import shared from "../_components/shared/shared.module.css";
import { ClearTermsButton } from "./ClearTermsButton";
import { clearOnboarding, completeOnboarding } from "./actions";
import {
  NO_REGION,
  STAND_IN_REGIONS,
  acceptedTermsOf,
  initialRegionChoice,
  isDevelopmentClerkInstance,
  isListedRegion,
  onboardingOf,
  safeReturnTo,
} from "./onboarding";
import styles from "./onboarding.module.css";

type OnboardingPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function termsStatus(acceptedTerms: ReturnType<typeof acceptedTermsOf>): string {
  if (acceptedTerms === null) {
    return "Not accepted";
  }
  const acceptedAt = new Date(acceptedTerms.acceptedAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  });
  return `Version ${acceptedTerms.version}, accepted ${acceptedAt}`;
}

/** Stands in for OWA's `/onboarding?returnTo=`, which the harness cannot reach. */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { returnTo: requested } = await searchParams;
  const returnTo = safeReturnTo(Array.isArray(requested) ? requested[0] : requested);
  const user = await currentUser();
  if (user === null) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }
  const { onboarded, region } = onboardingOf(user);
  const acceptedTerms = acceptedTermsOf(user);
  // As OWA's onboarding layout does for a teacher who is already onboarded.
  if (onboarded && requested !== undefined) {
    redirect(returnTo);
  }
  const writable = isDevelopmentClerkInstance(process.env.CLERK_SECRET_KEY);

  return (
    <>
      <SiteHeader />
      <main className={shared.main} id="main-content">
        <article className={`${shared.lesson} ${styles.page}`}>
          <p className={styles.badge}>Harness stand-in</p>
          <h1>Account setup</h1>

          <aside aria-labelledby="stand-in-heading" className={styles.explainer}>
            <h2 id="stand-in-heading">For harness testing only</h2>
            <p>
              In OWA, teachers set up their account once, through OWA&apos;s own
              onboarding. This page fakes that step for convenient testing.
            </p>
          </aside>

          <section aria-labelledby="account-heading" className={styles.panel}>
            <h2 id="account-heading">Your account</h2>
            <dl className={styles.facts}>
              <dt>Set up</dt>
              <dd>{onboarded ? "Yes" : "No"}</dd>
              <dt>Region</dt>
              <dd>{region ?? "None"}</dd>
              <dt>ORA's terms</dt>
              <dd>{termsStatus(acceptedTerms)}</dd>
            </dl>
          </section>

          {writable ? (
            <>
              <section aria-labelledby="setup-heading" className={styles.panel}>
                <h2 id="setup-heading">
                  {onboarded ? "Set up again" : "Set up this account"}
                </h2>
                <form action={completeOnboarding} className={styles.form}>
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <label htmlFor="stand-in-region">Region</label>
                  <p className={styles.hint} id="stand-in-region-hint">
                    Pick any region you want to test as. Teachers don&apos;t pick this
                    in the real flow.
                  </p>
                  <p className={styles.note} id="stand-in-region-note">
                    <strong>Oak accounts</strong> have full access in any region. To
                    test as a teacher outside the UK, use an{" "}
                    <code>access-limit-me</code> address.
                  </p>
                  <select
                    aria-describedby="stand-in-region-hint stand-in-region-note"
                    defaultValue={initialRegionChoice({ onboarded, region })}
                    id="stand-in-region"
                    name="region"
                  >
                    {region !== null && !isListedRegion(region) ? (
                      <option value={region}>{region} (current)</option>
                    ) : null}
                    {STAND_IN_REGIONS.map(({ code, label }) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                    <option value={NO_REGION}>No region</option>
                  </select>
                  <button className={styles.primary} type="submit">
                    Complete setup
                  </button>
                  {onboarded ? (
                    <p className={styles.hint}>
                      To see a new region, wait 10 seconds, then reload the lesson.
                    </p>
                  ) : null}
                </form>
              </section>

              <section aria-labelledby="terms-heading" className={styles.panel}>
                <h2 id="terms-heading">Clear ORA's terms</h2>
                <p className={styles.hint}>
                  To see the terms again when you open ORA, clear your acceptance.
                </p>
                <ClearTermsButton />
              </section>

              {onboarded || region !== null ? (
                <section aria-labelledby="reset-heading" className={styles.panel}>
                  <h2 id="reset-heading">Reset your account</h2>
                  <p className={styles.hint}>
                    To see the change, wait 10 seconds, then reload the lesson.
                  </p>
                  <form action={clearOnboarding} className={styles.form}>
                    <input name="returnTo" type="hidden" value={returnTo} />
                    <button className={styles.secondary} type="submit">
                      Clear setup
                    </button>
                  </form>
                </section>
              ) : null}
            </>
          ) : (
            <p className={styles.panel}>
              Account setup is only available with the development Clerk instance.
            </p>
          )}

          <p className={styles.back}>
            <Link href={returnTo}>Back to the harness</Link>
          </p>
        </article>
      </main>
    </>
  );
}
