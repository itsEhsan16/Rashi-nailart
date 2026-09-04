import { policyUpdatedLabel } from "@/lib/business";

/** Shared title block for the policy pages, so the "last updated" date and its
 *  placement are identical on every one of them. */
export function PageHeading({ title, showUpdated = true }: { title: string; showUpdated?: boolean }) {
  return (
    <div className="mb-8 border-b border-border/60 pb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      {showUpdated ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {policyUpdatedLabel()}
        </p>
      ) : null}
    </div>
  );
}
