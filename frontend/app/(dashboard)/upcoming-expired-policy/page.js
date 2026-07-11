import PolicyReportPage from '@/components/PolicyReportPage';

export default function UpcomingExpiredPolicyPage() {
  return (
    <PolicyReportPage
      title="Upcoming Expired Policy"
      description="Policies approaching expiry so agents can schedule renewal conversations before coverage lapses."
      mode="upcomingExpiry"
      daysAhead={30}
    />
  );
}
