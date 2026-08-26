import PolicyReportPage from '@/components/PolicyReportPage';

export default function UpcomingRenewalsPage() {
  return (
    <PolicyReportPage
      title="Upcoming Renewals"
      description="Pending renewal policies due from 1 Jan to 31 Dec of the current year."
      mode="pendingRenewals"
      status="Pending"
      policyBucket="renewal"
    />
  );
}
