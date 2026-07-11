import PolicyReportPage from '@/components/PolicyReportPage';

export default function ExpiredPoliciesPage() {
  return (
    <PolicyReportPage
      title="Expired Policy Details"
      description="Policies with past due dates that still need renewal, recovery, or closure follow-up."
      mode="expired"
    />
  );
}
