import PolicyReportPage from '@/components/PolicyReportPage';

export default function FreshPoliciesPage() {
  return (
    <PolicyReportPage
      title="Fresh Policies"
      description="New business policies kept separate from renewal follow-up records, with month and year filters."
      mode="freshPolicies"
      policyBucket="fresh"
    />
  );
}
